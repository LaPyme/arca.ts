import { ArcaServiceError } from "../errors";
import type { SoapTransport } from "../soap";
import type { ArcaClientConfig } from "../internal/types";
import type { WsaaAuthModule } from "../wsaa";

export type WsfeService = {
  createNextVoucher(input: {
    representedTaxId?: number | string;
    data: Record<string, unknown>;
  }): Promise<{
    CAE: string;
    CAEFchVto: string;
    voucherNumber: number;
    raw: Record<string, unknown>;
  }>;
  getLastVoucher(input: {
    representedTaxId?: number | string;
    salesPoint: number;
    voucherType: number;
    forceAuthRefresh?: boolean;
  }): Promise<number>;
  getSalesPoints(input: {
    representedTaxId?: number | string;
    forceAuthRefresh?: boolean;
  }): Promise<unknown>;
  getVoucherInfo(input: {
    representedTaxId?: number | string;
    number: number;
    salesPoint: number;
    voucherType: number;
  }): Promise<Record<string, unknown> | null>;
};

export type CreateWsfeServiceOptions = {
  config: ArcaClientConfig;
  auth: WsaaAuthModule;
  soap: SoapTransport;
};

export function createWsfeService(
  options: CreateWsfeServiceOptions
): WsfeService {
  return {
    async createNextVoucher({ representedTaxId, data }) {
      const salesPoint = Number(data["PtoVta"] ?? 0);
      const voucherType = Number(data["CbteTipo"] ?? 0);
      const voucherNumber = await this.getLastVoucher({
        representedTaxId,
        salesPoint,
        voucherType,
      });

      const requestData: Record<string, unknown> = {
        ...data,
        CbteDesde: voucherNumber,
        CbteHasta: voucherNumber,
      };
      const associatedVouchers = Array.isArray(requestData["CbtesAsoc"])
        ? (requestData["CbtesAsoc"] as unknown[])
        : undefined;
      const tributes = Array.isArray(requestData["Tributos"])
        ? (requestData["Tributos"] as unknown[])
        : undefined;
      const vatRates = Array.isArray(requestData["Iva"])
        ? (requestData["Iva"] as unknown[])
        : undefined;
      const optionalFields = Array.isArray(requestData["Opcionales"])
        ? (requestData["Opcionales"] as unknown[])
        : undefined;

      const auth = await options.auth.login("wsfe", { representedTaxId });
      const response = await options.soap.execute<
        Record<string, unknown>,
        Record<string, unknown>
      >({
        service: "wsfe",
        operation: "FECAESolicitar",
        body: {
          Auth: createWsfeAuth(
            representedTaxId ?? options.config.taxId,
            auth.token,
            auth.sign
          ),
          FeCAEReq: {
            FeCabReq: {
              CantReg:
                Number(requestData["CbteHasta"]) -
                Number(requestData["CbteDesde"]) +
                1,
              PtoVta: requestData["PtoVta"],
              CbteTipo: requestData["CbteTipo"],
            },
            FeDetReq: {
              FECAEDetRequest: {
                ...requestData,
                CbtesAsoc: associatedVouchers
                  ? { CbteAsoc: associatedVouchers }
                  : requestData["CbtesAsoc"],
                Tributos: tributes
                  ? { Tributo: tributes }
                  : requestData["Tributos"],
                Iva: vatRates ? { AlicIva: vatRates } : requestData["Iva"],
                Opcionales: optionalFields
                  ? { Opcional: optionalFields }
                  : requestData["Opcionales"],
              },
            },
          },
        },
      });

      const result = unwrapWsfeOperationResult(
        "FECAESolicitar",
        response.result
      );
      const detailResponse = normalizeWsfeDetailResponse(result);
      const cae = detailResponse.CAE;
      const caeExpiry = detailResponse.CAEFchVto;

      if (typeof cae !== "string" || typeof caeExpiry !== "string") {
        throw new ArcaServiceError(
          "WSFE did not return CAE authorization data",
          { detail: result }
        );
      }

      return {
        CAE: cae,
        CAEFchVto: caeExpiry,
        voucherNumber,
        raw: result,
      };
    },
    async getLastVoucher({
      representedTaxId,
      salesPoint,
      voucherType,
      forceAuthRefresh,
    }) {
      const auth = await options.auth.login("wsfe", {
        representedTaxId,
        forceRefresh: forceAuthRefresh,
      });
      const response = await options.soap.execute<
        Record<string, unknown>,
        Record<string, unknown>
      >({
        service: "wsfe",
        operation: "FECompUltimoAutorizado",
        body: {
          Auth: createWsfeAuth(
            representedTaxId ?? options.config.taxId,
            auth.token,
            auth.sign
          ),
          PtoVta: salesPoint,
          CbteTipo: voucherType,
        },
      });
      const result = unwrapWsfeOperationResult(
        "FECompUltimoAutorizado",
        response.result
      );
      return Number(result.CbteNro ?? 0) + 1;
    },
    async getSalesPoints({ representedTaxId, forceAuthRefresh }) {
      const auth = await options.auth.login("wsfe", {
        representedTaxId,
        forceRefresh: forceAuthRefresh,
      });
      const response = await options.soap.execute<
        Record<string, unknown>,
        Record<string, unknown>
      >({
        service: "wsfe",
        operation: "FEParamGetPtosVenta",
        body: {
          Auth: createWsfeAuth(
            representedTaxId ?? options.config.taxId,
            auth.token,
            auth.sign
          ),
        },
      });
      const result = unwrapWsfeOperationResult(
        "FEParamGetPtosVenta",
        response.result
      );
      const resultGet = result.ResultGet as Record<string, unknown> | undefined;
      return resultGet?.PtoVenta ?? [];
    },
    async getVoucherInfo({
      representedTaxId,
      number,
      salesPoint,
      voucherType,
    }) {
      const auth = await options.auth.login("wsfe", { representedTaxId });
      const response = await options.soap.execute<
        Record<string, unknown>,
        Record<string, unknown>
      >({
        service: "wsfe",
        operation: "FECompConsultar",
        body: {
          Auth: createWsfeAuth(
            representedTaxId ?? options.config.taxId,
            auth.token,
            auth.sign
          ),
          FeCompConsReq: {
            CbteNro: number,
            PtoVta: salesPoint,
            CbteTipo: voucherType,
          },
        },
      });
      const result = unwrapWsfeOperationResult(
        "FECompConsultar",
        response.result
      );
      return (result.ResultGet as Record<string, unknown> | null) ?? null;
    },
  };
}

function createWsfeAuth(
  representedTaxId: number | string,
  token: string,
  sign: string
) {
  return {
    Token: token,
    Sign: sign,
    Cuit: Number.parseInt(String(representedTaxId), 10),
  };
}

function unwrapWsfeOperationResult(
  operation: string,
  response: Record<string, unknown>
) {
  const operationResponse = response[`${operation}Response`] as
    | Record<string, unknown>
    | undefined;
  const result = (operationResponse?.[`${operation}Result`] ??
    response[`${operation}Result`] ??
    response) as Record<string, unknown>;

  if (operation === "FECAESolicitar") {
    const detailResponse = normalizeWsfeDetailResponse(result);
    const resultCode = detailResponse.Resultado;
    if (resultCode && resultCode !== "A") {
      const observationsContainer = detailResponse.Observaciones as
        | Record<string, unknown>
        | undefined;
      const observations = normalizeWsfeErrors(observationsContainer?.Obs);
      if (observations.length > 0) {
        const firstObservation = observations[0];
        if (!firstObservation) {
          throw new ArcaServiceError(
            "WSFE returned an empty observation list",
            {
              detail: result,
            }
          );
        }
        throw new ArcaServiceError(firstObservation.message, {
          serviceCode: firstObservation.code,
          detail: result,
        });
      }
    }
  }

  const errorsContainer = result.Errors as Record<string, unknown> | undefined;
  const errors = normalizeWsfeErrors(errorsContainer?.Err);
  if (errors.length > 0) {
    const firstError = errors[0];
    if (!firstError) {
      throw new ArcaServiceError("WSFE returned an empty error list", {
        detail: result,
      });
    }
    throw new ArcaServiceError(firstError.message, {
      serviceCode: firstError.code,
      detail: result,
    });
  }

  return result;
}

function normalizeWsfeDetailResponse(result: Record<string, unknown>) {
  const detailResponse = result.FeDetResp as
    | Record<string, unknown>
    | undefined;
  const rawDetail = detailResponse?.FECAEDetResponse;

  if (Array.isArray(rawDetail)) {
    return (rawDetail[0] as Record<string, unknown>) ?? {};
  }

  return (rawDetail as Record<string, unknown> | undefined) ?? {};
}

function normalizeWsfeErrors(rawErrors: unknown) {
  const entries = Array.isArray(rawErrors)
    ? rawErrors
    : rawErrors
      ? [rawErrors]
      : [];

  return entries
    .map((entry) => entry as Record<string, unknown>)
    .map((entry) => {
      const code = entry.Code ?? entry.code ?? "N/A";
      const message = entry.Msg ?? entry.msg ?? "Error desconocido de WSFE";
      return {
        code: String(code),
        message: `(${String(code)}) ${String(message)}`,
      };
    });
}
