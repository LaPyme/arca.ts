import { ArcaServiceError } from "../errors";
import type { SoapTransport } from "../soap";
import type {
  ArcaClientConfig,
  ArcaRepresentedTaxId,
} from "../internal/types";
import type { WsaaAuthModule } from "../wsaa";

export type WsmtxcaAuthorizationResult = {
  cae: string;
  caeExpiry?: string;
  voucherNumber: number;
  messages: string[];
  raw: Record<string, unknown>;
};

export type WsmtxcaLastAuthorizedVoucherResult = {
  voucherNumber: number;
  raw: Record<string, unknown>;
};

export type WsmtxcaVoucherLookupResult = {
  invoiceDate: string;
  voucher: Record<string, unknown>;
  messages: string[];
  raw: Record<string, unknown>;
};

export type WsmtxcaService = {
  authorizeVoucher(input: {
    representedTaxId?: ArcaRepresentedTaxId;
    data: Record<string, unknown>;
  }): Promise<WsmtxcaAuthorizationResult>;
  getLastAuthorizedVoucher(input: {
    representedTaxId?: ArcaRepresentedTaxId;
    voucherType: number;
    pointOfSaleNumber: number;
  }): Promise<WsmtxcaLastAuthorizedVoucherResult>;
  getVoucher(input: {
    representedTaxId?: ArcaRepresentedTaxId;
    voucherType: number;
    pointOfSaleNumber: number;
    voucherNumber: number;
  }): Promise<WsmtxcaVoucherLookupResult>;
};

export type CreateWsmtxcaServiceOptions = {
  config: ArcaClientConfig;
  auth: WsaaAuthModule;
  soap: SoapTransport;
};

export function createWsmtxcaService(
  options: CreateWsmtxcaServiceOptions
): WsmtxcaService {
  return {
    async authorizeVoucher({ representedTaxId, data }) {
      const auth = await options.auth.login("wsmtxca", { representedTaxId });
      const response = await options.soap.execute<
        Record<string, unknown>,
        Record<string, unknown>
      >({
        service: "wsmtxca",
        operation: "autorizarComprobante",
        bodyElementName: "autorizarComprobanteRequest",
        bodyElementNamespaceMode: "prefix",
        body: {
          authRequest: createWsmtxcaAuth(
            representedTaxId ?? options.config.taxId,
            auth.token,
            auth.sign
          ),
          ...(data as Record<string, unknown>),
        },
      });

      const raw = unwrapWsmtxcaOperationResponse(
        response.result,
        "autorizarComprobante"
      );
      const authorizationPayload = extractWsmtxcaAuthorizationPayload(raw);
      const messages = extractWsmtxcaMessages(raw);
      const resultado = raw.resultado ?? authorizationPayload.resultado;

      const caeValue =
        authorizationPayload.CAE ??
        authorizationPayload.codigoAutorizacion ??
        raw.codigoAutorizacion;

      if (resultado === "R" || caeValue == null) {
        throw new ArcaServiceError(
          messages.join(" | ") ||
            "WSMTXCA rechazó la autorización del comprobante",
          { detail: raw }
        );
      }

      return {
        cae: String(caeValue),
        caeExpiry: normalizeWsmtxcaResponseDate(
          authorizationPayload.fechaVencimientoCAE ??
            authorizationPayload.fechaVencimiento ??
            raw.fechaVencimiento
        ),
        voucherNumber: parseWsmtxcaVoucherNumber(
          authorizationPayload.numeroComprobante ?? raw.numeroComprobante,
          "WSMTXCA no devolvió el número del comprobante autorizado",
          raw
        ),
        messages,
        raw,
      };
    },
    async getLastAuthorizedVoucher({
      representedTaxId,
      voucherType,
      pointOfSaleNumber,
    }) {
      const auth = await options.auth.login("wsmtxca", { representedTaxId });
      const response = await options.soap.execute<
        Record<string, unknown>,
        Record<string, unknown>
      >({
        service: "wsmtxca",
        operation: "consultarUltimoComprobanteAutorizado",
        bodyElementName: "consultarUltimoComprobanteAutorizadoRequest",
        bodyElementNamespaceMode: "prefix",
        body: {
          authRequest: createWsmtxcaAuth(
            representedTaxId ?? options.config.taxId,
            auth.token,
            auth.sign
          ),
          consultaUltimoComprobanteAutorizadoRequest: {
            codigoTipoComprobante: voucherType,
            numeroPuntoVenta: pointOfSaleNumber,
          },
        },
      });

      const raw = unwrapWsmtxcaOperationResponse(
        response.result,
        "consultarUltimoComprobanteAutorizado"
      );
      return {
        voucherNumber: parseWsmtxcaVoucherNumber(
          raw.numeroComprobante ?? raw.cbteNro ?? raw.nroComprobante,
          extractWsmtxcaMessages(raw).join(" | ") ||
            "WSMTXCA no devolvió el último número de comprobante autorizado",
          raw
        ),
        raw,
      };
    },
    async getVoucher({
      representedTaxId,
      voucherType,
      pointOfSaleNumber,
      voucherNumber,
    }) {
      const auth = await options.auth.login("wsmtxca", { representedTaxId });
      const response = await options.soap.execute<
        Record<string, unknown>,
        Record<string, unknown>
      >({
        service: "wsmtxca",
        operation: "consultarComprobante",
        bodyElementName: "consultarComprobanteRequest",
        bodyElementNamespaceMode: "prefix",
        body: {
          authRequest: createWsmtxcaAuth(
            representedTaxId ?? options.config.taxId,
            auth.token,
            auth.sign
          ),
          consultaComprobanteRequest: {
            codigoTipoComprobante: voucherType,
            numeroPuntoVenta: pointOfSaleNumber,
            numeroComprobante: voucherNumber,
          },
        },
      });

      const raw = unwrapWsmtxcaOperationResponse(
        response.result,
        "consultarComprobante"
      );
      const voucher = extractWsmtxcaVoucherPayload(raw);
      const messages = extractWsmtxcaMessages(raw);
      const invoiceDate = normalizeWsmtxcaResponseDate(
        voucher.fechaEmision ?? voucher.fecha ?? voucher.CbteFch
      );

      if (!invoiceDate) {
        throw new ArcaServiceError(
          messages[0] ??
            "WSMTXCA no devolvió la fecha de emisión del comprobante asociado",
          { detail: raw }
        );
      }

      return {
        invoiceDate,
        voucher,
        messages,
        raw,
      };
    },
  };
}

function createWsmtxcaAuth(
  representedTaxId: number | string,
  token: string,
  sign: string
) {
  return {
    token,
    sign,
    cuitRepresentada: Number.parseInt(String(representedTaxId), 10),
  };
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function unwrapWsmtxcaOperationResponse(
  response: unknown,
  operation:
    | "autorizarComprobante"
    | "consultarUltimoComprobanteAutorizado"
    | "consultarComprobante"
) {
  const responseRecord = toRecord(response) ?? {};

  if (operation === "autorizarComprobante") {
    return (
      toRecord(responseRecord.autorizarComprobanteResponse) ??
      toRecord(responseRecord.autorizarComprobanteResult) ??
      toRecord(responseRecord.comprobanteCAEResponse) ??
      toRecord(responseRecord.comprobanteCAEReponse) ??
      responseRecord
    );
  }

  if (operation === "consultarComprobante") {
    return (
      toRecord(responseRecord.consultarComprobanteResponse) ??
      toRecord(responseRecord.consultaComprobanteResponse) ??
      toRecord(responseRecord.consultarComprobanteResult) ??
      responseRecord
    );
  }

  return (
    toRecord(responseRecord.consultarUltimoComprobanteAutorizadoResponse) ??
    toRecord(responseRecord.consultaUltimoComprobanteAutorizadoResponse) ??
    toRecord(responseRecord.consultarUltimoComprobanteAutorizadoResult) ??
    responseRecord
  );
}

function extractWsmtxcaAuthorizationPayload(raw: Record<string, unknown>) {
  return (
    toRecord(raw.comprobanteResponse) ??
    toRecord(raw.comprobanteCAEResponse) ??
    toRecord(raw.comprobanteCAEReponse) ??
    raw
  );
}

function extractWsmtxcaVoucherPayload(raw: Record<string, unknown>) {
  return (
    toRecord(raw.comprobanteResponse) ??
    toRecord(raw.comprobante) ??
    toRecord(raw.cmp) ??
    raw
  );
}

function extractWsmtxcaMessages(raw: Record<string, unknown>): string[] {
  const rawErrors = raw.arrayErrores as
    | { codigoDescripcion?: unknown }
    | undefined;
  const rawObservations = raw.arrayObservaciones as
    | { codigoDescripcion?: unknown }
    | undefined;

  const toEntries = (
    value: unknown
  ): Array<{ codigo?: unknown; descripcion?: unknown }> => {
    if (!value) {
      return [];
    }
    if (Array.isArray(value)) {
      return value as Array<{ codigo?: unknown; descripcion?: unknown }>;
    }
    if (typeof value === "object") {
      return [value as { codigo?: unknown; descripcion?: unknown }];
    }
    return [];
  };

  const errors = toEntries(rawErrors?.codigoDescripcion).map((entry) => {
    const code = entry.codigo == null ? "N/A" : String(entry.codigo);
    const description =
      entry.descripcion == null
        ? "Error desconocido en WSMTXCA"
        : String(entry.descripcion);
    return `Error ${code}: ${description}`;
  });

  const observations = toEntries(rawObservations?.codigoDescripcion).map(
    (entry) => {
      const code = entry.codigo == null ? "N/A" : String(entry.codigo);
      const description =
        entry.descripcion == null ? "" : String(entry.descripcion);
      return `Obs ${code}: ${description}`.trim();
    }
  );

  return [...errors, ...observations];
}

function parseWsmtxcaVoucherNumber(
  value: unknown,
  message: string,
  detail: Record<string, unknown>
) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ArcaServiceError(message, { detail });
  }
  return parsed;
}

function normalizeWsmtxcaResponseDate(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return formatCompactDateToIso(value);
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^\d{8}$/.test(trimmed)) {
    return formatCompactDateToIso(Number.parseInt(trimmed, 10));
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }

  return undefined;
}

function formatCompactDateToIso(dateValue?: number | null): string | undefined {
  if (!dateValue) {
    return undefined;
  }

  const raw = String(dateValue);
  if (raw.length !== 8) {
    return undefined;
  }

  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}
