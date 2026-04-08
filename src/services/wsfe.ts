import { ArcaServiceError } from "../errors";
import type { SoapTransport } from "../soap";
import type { ArcaClientConfig } from "../internal/types";
import type { WsaaAuthModule } from "../wsaa";

/** An associated voucher referenced by a WSFE invoice request. */
export type WsfeAssociatedVoucher = {
  type: number;
  salesPoint: number;
  number: number;
  taxId?: string;
  voucherDate?: string;
};

/** A tax (tributo) item in a WSFE invoice request. */
export type WsfeTax = {
  id: number;
  description?: string;
  baseAmount: number;
  rate: number;
  amount: number;
};

/** A VAT rate (alícuota IVA) item in a WSFE invoice request. */
export type WsfeVatRate = {
  id: number;
  baseAmount: number;
  amount: number;
};

/** An optional field (campo opcional) in a WSFE invoice request. */
export type WsfeOptionalField = {
  id: string;
  value: string;
};

/** A buyer (comprador) in a WSFE invoice request. */
export type WsfeBuyer = {
  documentType: number;
  documentNumber: number;
  percentage: number;
};

/** Input data for creating a new WSFE voucher via {@link WsfeService.createNextVoucher}. */
export type WsfeVoucherInput = {
  salesPoint: number;
  voucherType: number;
  concept: number;
  documentType: number;
  documentNumber: number;
  voucherDate: string;
  totalAmount: number;
  nonTaxableAmount: number;
  netAmount: number;
  exemptAmount: number;
  taxAmount: number;
  vatAmount: number;
  currencyId: string;
  exchangeRate: number;
  serviceStartDate?: string;
  serviceEndDate?: string;
  paymentDueDate?: string;
  associatedVouchers?: WsfeAssociatedVoucher[];
  taxes?: WsfeTax[];
  vatRates?: WsfeVatRate[];
  optionalFields?: WsfeOptionalField[];
  buyers?: WsfeBuyer[];
};

/** Result of a successful WSFE voucher authorization. */
export type WsfeAuthorizationResult = {
  cae: string;
  caeExpiry: string;
  voucherNumber: number;
  raw: Record<string, unknown>;
};

/** A point-of-sale entry returned by {@link WsfeService.getSalesPoints}. */
export type WsfeSalesPoint = {
  number: number;
  emissionType?: string;
  blocked?: string;
  deletedSince?: string;
};

/** Voucher details returned by {@link WsfeService.getVoucherInfo}. */
export type WsfeVoucherInfo = {
  voucherNumber: number;
  voucherDate?: string;
  salesPoint?: number;
  voucherType?: number;
  totalAmount?: number;
  result?: string;
  cae?: string;
  caeExpiry?: string;
  raw: Record<string, unknown>;
};

/** WSFE electronic invoicing service. */
export type WsfeService = {
  /** Authorizes a new voucher by fetching the next number and requesting a CAE. */
  createNextVoucher(input: {
    representedTaxId?: number | string;
    data: WsfeVoucherInput;
  }): Promise<WsfeAuthorizationResult>;
  /** Returns the next available voucher number for the given sales point and type. */
  getLastVoucher(input: {
    representedTaxId?: number | string;
    salesPoint: number;
    voucherType: number;
    forceAuthRefresh?: boolean;
  }): Promise<number>;
  /** Lists all configured points of sale for the taxpayer. */
  getSalesPoints(input: {
    representedTaxId?: number | string;
    forceAuthRefresh?: boolean;
  }): Promise<WsfeSalesPoint[]>;
  /** Retrieves details for a specific voucher. Returns `null` if not found. */
  getVoucherInfo(input: {
    representedTaxId?: number | string;
    number: number;
    salesPoint: number;
    voucherType: number;
  }): Promise<WsfeVoucherInfo | null>;
};

export type CreateWsfeServiceOptions = {
  config: ArcaClientConfig;
  auth: WsaaAuthModule;
  soap: SoapTransport;
};

/** Creates a WSFE service instance wired with authentication and SOAP transport. */
export function createWsfeService(
  options: CreateWsfeServiceOptions
): WsfeService {
  async function getLastVoucher({
    representedTaxId,
    salesPoint,
    voucherType,
    forceAuthRefresh,
  }: {
    representedTaxId?: number | string;
    salesPoint: number;
    voucherType: number;
    forceAuthRefresh?: boolean;
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
  }

  return {
    async createNextVoucher({ representedTaxId, data }) {
      const voucherNumber = await getLastVoucher({
        representedTaxId,
        salesPoint: data.salesPoint,
        voucherType: data.voucherType,
      });

      const requestData = mapWsfeVoucherInput(data, voucherNumber);

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
              CantReg: 1,
              PtoVta: data.salesPoint,
              CbteTipo: data.voucherType,
            },
            FeDetReq: {
              FECAEDetRequest: requestData,
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
        cae,
        caeExpiry: String(caeExpiry),
        voucherNumber,
        raw: result,
      };
    },
    getLastVoucher,
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
      const rawPoints = resultGet?.PtoVenta;
      if (!rawPoints) {
        return [];
      }
      const entries = Array.isArray(rawPoints) ? rawPoints : [rawPoints];
      return entries.map(mapWsfeSalesPoint);
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
      const raw = (result.ResultGet as Record<string, unknown> | null) ?? null;
      if (!raw) {
        return null;
      }
      return mapWsfeVoucherInfo(raw);
    },
  };
}

function mapWsfeVoucherInput(
  input: WsfeVoucherInput,
  voucherNumber: number
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    Concepto: input.concept,
    DocTipo: input.documentType,
    DocNro: input.documentNumber,
    CbteDesde: voucherNumber,
    CbteHasta: voucherNumber,
    CbteFch: input.voucherDate,
    ImpTotal: input.totalAmount,
    ImpTotConc: input.nonTaxableAmount,
    ImpNeto: input.netAmount,
    ImpOpEx: input.exemptAmount,
    ImpTrib: input.taxAmount,
    ImpIVA: input.vatAmount,
    MonId: input.currencyId,
    MonCotiz: input.exchangeRate,
    PtoVta: input.salesPoint,
    CbteTipo: input.voucherType,
  };

  if (input.serviceStartDate !== undefined) {
    data.FchServDesde = input.serviceStartDate;
  }
  if (input.serviceEndDate !== undefined) {
    data.FchServHasta = input.serviceEndDate;
  }
  if (input.paymentDueDate !== undefined) {
    data.FchVtoPago = input.paymentDueDate;
  }

  if (input.associatedVouchers) {
    data.CbtesAsoc = {
      CbteAsoc: input.associatedVouchers.map((v) => ({
        Tipo: v.type,
        PtoVta: v.salesPoint,
        Nro: v.number,
        ...(v.taxId !== undefined ? { Cuit: v.taxId } : {}),
        ...(v.voucherDate !== undefined ? { CbteFch: v.voucherDate } : {}),
      })),
    };
  }

  if (input.taxes) {
    data.Tributos = {
      Tributo: input.taxes.map((t) => ({
        Id: t.id,
        ...(t.description !== undefined ? { Desc: t.description } : {}),
        BaseImp: t.baseAmount,
        Alic: t.rate,
        Importe: t.amount,
      })),
    };
  }

  if (input.vatRates) {
    data.Iva = {
      AlicIva: input.vatRates.map((v) => ({
        Id: v.id,
        BaseImp: v.baseAmount,
        Importe: v.amount,
      })),
    };
  }

  if (input.optionalFields) {
    data.Opcionales = {
      Opcional: input.optionalFields.map((o) => ({
        Id: o.id,
        Valor: o.value,
      })),
    };
  }

  if (input.buyers) {
    data.Compradores = {
      Comprador: input.buyers.map((b) => ({
        DocTipo: b.documentType,
        DocNro: b.documentNumber,
        Porcentaje: b.percentage,
      })),
    };
  }

  return data;
}

function mapWsfeSalesPoint(raw: unknown): WsfeSalesPoint {
  const record = raw as Record<string, unknown>;
  return {
    number: Number(record.Nro ?? 0),
    ...(record.EmisionTipo !== undefined
      ? { emissionType: String(record.EmisionTipo) }
      : {}),
    ...(record.Bloqueado !== undefined
      ? { blocked: String(record.Bloqueado) }
      : {}),
    ...(record.FchBaja !== undefined
      ? { deletedSince: String(record.FchBaja) }
      : {}),
  };
}

function mapWsfeVoucherInfo(raw: Record<string, unknown>): WsfeVoucherInfo {
  return {
    voucherNumber: Number(raw.CbteDesde ?? raw.CbteHasta ?? 0),
    ...(raw.CbteFch !== undefined ? { voucherDate: String(raw.CbteFch) } : {}),
    ...(raw.PtoVta !== undefined ? { salesPoint: Number(raw.PtoVta) } : {}),
    ...(raw.CbteTipo !== undefined
      ? { voucherType: Number(raw.CbteTipo) }
      : {}),
    ...(raw.ImpTotal !== undefined
      ? { totalAmount: Number(raw.ImpTotal) }
      : {}),
    ...(raw.Resultado !== undefined ? { result: String(raw.Resultado) } : {}),
    ...(raw.CAE !== undefined ? { cae: String(raw.CAE) } : {}),
    ...(raw.CAEFchVto !== undefined
      ? { caeExpiry: String(raw.CAEFchVto) }
      : {}),
    raw,
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
      const message = entry.Msg ?? entry.msg ?? "Unknown WSFE error";
      return {
        code: String(code),
        message: `(${String(code)}) ${String(message)}`,
      };
    });
}
