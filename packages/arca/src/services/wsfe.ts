import { ArcaInputError, ArcaServiceError } from "../errors";
import type { ArcaClientConfig, ArcaRepresentedTaxId } from "../internal/types";
import type { SoapTransport } from "../soap";
import type { WsaaAuthModule } from "../wsaa";

/** Accepted public date inputs for WSFE request fields. */
export type WsfeDateInput =
  | `${number}${number}${number}${number}-${number}${number}-${number}${number}`
  | `${number}${number}${number}${number}${number}${number}${number}${number}`;

/** An associated voucher referenced by a WSFE invoice request. */
export type WsfeAssociatedVoucher = {
  type: number;
  salesPoint: number;
  number: number;
  taxId?: string;
  voucherDate?: WsfeDateInput;
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
  receiverVatConditionId?: number;
  voucherDate: WsfeDateInput;
  totalAmount: number;
  nonTaxableAmount: number;
  netAmount: number;
  exemptAmount: number;
  taxAmount: number;
  vatAmount: number;
  currencyId: string;
  exchangeRate: number;
  serviceStartDate?: WsfeDateInput;
  serviceEndDate?: WsfeDateInput;
  paymentDueDate?: WsfeDateInput;
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

export type WsfeCatalogEntry = {
  id: number;
  description: string;
};

export type WsfeCurrencyType = {
  id: string;
  description: string;
  validFrom: string;
  validTo: string;
};

export type WsfeServerStatus = {
  appServer: string;
  dbServer: string;
  authServer: string;
};

export type WsfeQuotation = {
  currencyId: string;
  rate: number;
  date: string;
};

/** WSFE electronic invoicing service. */
export type WsfeService = {
  /** Authorizes a new voucher by fetching the next number and requesting a CAE. */
  createNextVoucher(input: {
    representedTaxId?: number | string;
    data: WsfeVoucherInput;
  }): Promise<WsfeAuthorizationResult>;
  /** Returns the next available voucher number for the given sales point and type. */
  getNextVoucherNumber(input: {
    representedTaxId?: number | string;
    salesPoint: number;
    voucherType: number;
    forceAuthRefresh?: boolean;
  }): Promise<number>;
  /**
   * @deprecated Use `getNextVoucherNumber()` instead.
   * Returns the next available voucher number, not the last authorized one.
   */
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
  /** Lists voucher types accepted by WSFE. */
  getVoucherTypes(input: {
    representedTaxId?: number | string;
    forceAuthRefresh?: boolean;
  }): Promise<WsfeCatalogEntry[]>;
  /** Lists document types accepted by WSFE. */
  getDocumentTypes(input: {
    representedTaxId?: number | string;
    forceAuthRefresh?: boolean;
  }): Promise<WsfeCatalogEntry[]>;
  /** Lists concept types accepted by WSFE. */
  getConceptTypes(input: {
    representedTaxId?: number | string;
    forceAuthRefresh?: boolean;
  }): Promise<WsfeCatalogEntry[]>;
  /** Lists supported currency types. */
  getCurrencyTypes(input: {
    representedTaxId?: number | string;
    forceAuthRefresh?: boolean;
  }): Promise<WsfeCurrencyType[]>;
  /** Lists VAT rates accepted by WSFE. */
  getVatRates(input: {
    representedTaxId?: number | string;
    forceAuthRefresh?: boolean;
  }): Promise<WsfeCatalogEntry[]>;
  /** Lists tax types accepted by WSFE. */
  getTaxTypes(input: {
    representedTaxId?: number | string;
    forceAuthRefresh?: boolean;
  }): Promise<WsfeCatalogEntry[]>;
  /** Lists optional field types accepted by WSFE. */
  getOptionalTypes(input: {
    representedTaxId?: number | string;
    forceAuthRefresh?: boolean;
  }): Promise<WsfeCatalogEntry[]>;
  /** Reports WSFE backend status without requiring taxpayer authorization. */
  getServerStatus(): Promise<WsfeServerStatus>;
  /** Returns the exchange rate for a given currency. */
  getQuotation(input: {
    currencyId: string;
    representedTaxId?: number | string;
    forceAuthRefresh?: boolean;
  }): Promise<WsfeQuotation>;
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

type NormalizedWsfeAssociatedVoucher = Omit<
  WsfeAssociatedVoucher,
  "voucherDate"
> & {
  voucherDate?: string;
};

type NormalizedWsfeVoucherInput = Omit<
  WsfeVoucherInput,
  | "voucherDate"
  | "serviceStartDate"
  | "serviceEndDate"
  | "paymentDueDate"
  | "associatedVouchers"
> & {
  voucherDate: string;
  serviceStartDate?: string;
  serviceEndDate?: string;
  paymentDueDate?: string;
  associatedVouchers?: NormalizedWsfeAssociatedVoucher[];
};

/** Creates a WSFE service instance wired with authentication and SOAP transport. */
export function createWsfeService(
  options: CreateWsfeServiceOptions
): WsfeService {
  async function executeWsfeAuthenticatedOperation(
    operation: string,
    input: {
      representedTaxId?: ArcaRepresentedTaxId;
      forceAuthRefresh?: boolean;
    },
    body: Record<string, unknown> = {}
  ) {
    const auth = await options.auth.login("wsfe", {
      representedTaxId: input.representedTaxId,
      forceRefresh: input.forceAuthRefresh,
    });
    const response = await options.soap.execute<
      Record<string, unknown>,
      Record<string, unknown>
    >({
      service: "wsfe",
      operation,
      body: {
        Auth: createWsfeAuth(
          input.representedTaxId ?? options.config.taxId,
          auth.token,
          auth.sign
        ),
        ...body,
      },
    });

    return unwrapWsfeOperationResult(operation, response.result);
  }

  async function executeWsfeOperation(
    operation: string,
    body: Record<string, unknown> = {}
  ) {
    const response = await options.soap.execute<
      Record<string, unknown>,
      Record<string, unknown>
    >({
      service: "wsfe",
      operation,
      body,
    });

    return unwrapWsfeOperationResult(operation, response.result);
  }

  async function getNextVoucherNumber({
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
    const result = await executeWsfeAuthenticatedOperation(
      "FECompUltimoAutorizado",
      {
        representedTaxId,
        forceAuthRefresh,
      },
      {
        PtoVta: salesPoint,
        CbteTipo: voucherType,
      }
    );
    return Number(result.CbteNro ?? 0) + 1;
  }

  async function getWsfeCatalog(
    operation: string,
    resultKey: string,
    input: {
      representedTaxId?: ArcaRepresentedTaxId;
      forceAuthRefresh?: boolean;
    }
  ): Promise<WsfeCatalogEntry[]> {
    const result = await executeWsfeAuthenticatedOperation(operation, {
      representedTaxId: input.representedTaxId,
      forceAuthRefresh: input.forceAuthRefresh,
    });
    return getWsfeResultEntries(result, resultKey).map(mapWsfeCatalogEntry);
  }

  return {
    async createNextVoucher({ representedTaxId, data }) {
      const normalizedInput = normalizeWsfeVoucherInput(data);

      const voucherNumber = await getNextVoucherNumber({
        representedTaxId,
        salesPoint: normalizedInput.salesPoint,
        voucherType: normalizedInput.voucherType,
      });

      const requestData = mapWsfeVoucherInput(normalizedInput, voucherNumber);

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
              PtoVta: normalizedInput.salesPoint,
              CbteTipo: normalizedInput.voucherType,
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
    getNextVoucherNumber,
    getLastVoucher(input) {
      return getNextVoucherNumber(input);
    },
    async getSalesPoints({ representedTaxId, forceAuthRefresh }) {
      const result = await executeWsfeAuthenticatedOperation(
        "FEParamGetPtosVenta",
        {
          representedTaxId,
          forceAuthRefresh,
        }
      );
      const rawPoints = (
        result.ResultGet as Record<string, unknown> | undefined
      )?.PtoVenta;
      if (!rawPoints) {
        return [];
      }
      const entries = Array.isArray(rawPoints) ? rawPoints : [rawPoints];
      return entries.map(mapWsfeSalesPoint);
    },
    getVoucherTypes(input) {
      return getWsfeCatalog("FEParamGetTiposCbte", "CbteTipo", input);
    },
    getDocumentTypes(input) {
      return getWsfeCatalog("FEParamGetTiposDoc", "DocTipo", input);
    },
    getConceptTypes(input) {
      return getWsfeCatalog("FEParamGetTiposConcepto", "ConceptoTipo", input);
    },
    async getCurrencyTypes({ representedTaxId, forceAuthRefresh }) {
      const result = await executeWsfeAuthenticatedOperation(
        "FEParamGetTiposMonedas",
        {
          representedTaxId,
          forceAuthRefresh,
        }
      );
      return getWsfeResultEntries(result, "Moneda").map(mapWsfeCurrencyType);
    },
    getVatRates(input) {
      return getWsfeCatalog("FEParamGetTiposIva", "IvaTipo", input);
    },
    getTaxTypes(input) {
      return getWsfeCatalog("FEParamGetTiposTributos", "TributoTipo", input);
    },
    getOptionalTypes(input) {
      return getWsfeCatalog("FEParamGetTiposOpcional", "OpcionalTipo", input);
    },
    async getServerStatus() {
      const result = await executeWsfeOperation("FEDummy");
      return mapWsfeServerStatus(result);
    },
    async getQuotation({ currencyId, representedTaxId, forceAuthRefresh }) {
      const result = await executeWsfeAuthenticatedOperation(
        "FEParamGetCotizacion",
        {
          representedTaxId,
          forceAuthRefresh,
        },
        {
          MonId: currencyId,
        }
      );
      const raw =
        (result.ResultGet as Record<string, unknown> | undefined) ?? {};
      return mapWsfeQuotation(raw);
    },
    async getVoucherInfo({
      representedTaxId,
      number,
      salesPoint,
      voucherType,
    }) {
      const result = await executeWsfeAuthenticatedOperation(
        "FECompConsultar",
        {
          representedTaxId,
        },
        {
          FeCompConsReq: {
            CbteNro: number,
            PtoVta: salesPoint,
            CbteTipo: voucherType,
          },
        }
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
  input: NormalizedWsfeVoucherInput,
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

  if (input.receiverVatConditionId !== undefined) {
    data.CondicionIVAReceptorId = input.receiverVatConditionId;
  }

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
        ...(v.taxId === undefined ? {} : { Cuit: v.taxId }),
        ...(v.voucherDate === undefined ? {} : { CbteFch: v.voucherDate }),
      })),
    };
  }

  if (input.taxes) {
    data.Tributos = {
      Tributo: input.taxes.map((t) => ({
        Id: t.id,
        ...(t.description === undefined ? {} : { Desc: t.description }),
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

function normalizeWsfeVoucherInput(
  input: WsfeVoucherInput
): NormalizedWsfeVoucherInput {
  const {
    voucherDate,
    serviceStartDate,
    serviceEndDate,
    paymentDueDate,
    associatedVouchers,
    ...rest
  } = input;

  return {
    ...rest,
    voucherDate: normalizeWsfeDateInput(voucherDate, "voucherDate"),
    ...(serviceStartDate === undefined
      ? {}
      : {
          serviceStartDate: normalizeWsfeDateInput(
            serviceStartDate,
            "serviceStartDate"
          ),
        }),
    ...(serviceEndDate === undefined
      ? {}
      : {
          serviceEndDate: normalizeWsfeDateInput(
            serviceEndDate,
            "serviceEndDate"
          ),
        }),
    ...(paymentDueDate === undefined
      ? {}
      : {
          paymentDueDate: normalizeWsfeDateInput(
            paymentDueDate,
            "paymentDueDate"
          ),
        }),
    ...(associatedVouchers === undefined
      ? {}
      : {
          associatedVouchers: associatedVouchers.map((voucher, index) => {
            const { voucherDate: associatedVoucherDate, ...associatedRest } =
              voucher;

            return {
              ...associatedRest,
              ...(associatedVoucherDate === undefined
                ? {}
                : {
                    voucherDate: normalizeWsfeDateInput(
                      associatedVoucherDate,
                      `associatedVouchers[${index}].voucherDate`
                    ),
                  }),
            };
          }),
        }),
  };
}

function normalizeWsfeDateInput(
  value: WsfeDateInput,
  fieldName: string
): string {
  if (typeof value !== "string") {
    throw new ArcaInputError(
      `Invalid WSFE ${fieldName}: expected a YYYY-MM-DD or YYYYMMDD string`,
      {
        detail: { field: fieldName, value },
      }
    );
  }

  const normalizedValue = value.trim();
  const afipMatch = normalizedValue.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (afipMatch) {
    const [, year, month, day] = afipMatch;
    assertValidCalendarDate(year, month, day, fieldName, normalizedValue);
    return normalizedValue;
  }

  const isoMatch = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    assertValidCalendarDate(year, month, day, fieldName, normalizedValue);
    return `${year}${month}${day}`;
  }

  throw new ArcaInputError(
    `Invalid WSFE ${fieldName}: expected a YYYY-MM-DD or YYYYMMDD string`,
    {
      detail: { field: fieldName, value: normalizedValue },
    }
  );
}

function assertValidCalendarDate(
  yearInput: string,
  monthInput: string,
  dayInput: string,
  fieldName: string,
  value: string
) {
  const year = Number(yearInput);
  const month = Number(monthInput);
  const day = Number(dayInput);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new ArcaInputError(
      `Invalid WSFE ${fieldName}: received a non-existent calendar date`,
      {
        detail: { field: fieldName, value },
      }
    );
  }
}

function mapWsfeSalesPoint(raw: unknown): WsfeSalesPoint {
  const record = raw as Record<string, unknown>;
  return {
    number: Number(record.Nro ?? 0),
    ...(record.EmisionTipo === undefined
      ? {}
      : { emissionType: String(record.EmisionTipo) }),
    ...(record.Bloqueado === undefined
      ? {}
      : { blocked: String(record.Bloqueado) }),
    ...(record.FchBaja === undefined
      ? {}
      : { deletedSince: String(record.FchBaja) }),
  };
}

function mapWsfeCatalogEntry(raw: unknown): WsfeCatalogEntry {
  const record = raw as Record<string, unknown>;
  return {
    id: Number(record.Id ?? 0),
    description: String(record.Desc ?? ""),
  };
}

function mapWsfeCurrencyType(raw: unknown): WsfeCurrencyType {
  const record = raw as Record<string, unknown>;
  return {
    id: String(record.Id ?? ""),
    description: String(record.Desc ?? ""),
    validFrom: String(record.FchDesde ?? ""),
    validTo: String(record.FchHasta ?? ""),
  };
}

function mapWsfeServerStatus(raw: Record<string, unknown>): WsfeServerStatus {
  return {
    appServer: String(raw.AppServer ?? ""),
    dbServer: String(raw.DbServer ?? ""),
    authServer: String(raw.AuthServer ?? ""),
  };
}

function mapWsfeQuotation(raw: Record<string, unknown>): WsfeQuotation {
  return {
    currencyId: String(raw.MonId ?? ""),
    rate: Number(raw.MonCotiz ?? 0),
    date: String(raw.FchCotiz ?? ""),
  };
}

function mapWsfeVoucherInfo(raw: Record<string, unknown>): WsfeVoucherInfo {
  return {
    voucherNumber: Number(raw.CbteDesde ?? raw.CbteHasta ?? 0),
    ...(raw.CbteFch === undefined ? {} : { voucherDate: String(raw.CbteFch) }),
    ...(raw.PtoVta === undefined ? {} : { salesPoint: Number(raw.PtoVta) }),
    ...(raw.CbteTipo === undefined
      ? {}
      : { voucherType: Number(raw.CbteTipo) }),
    ...(raw.ImpTotal === undefined
      ? {}
      : { totalAmount: Number(raw.ImpTotal) }),
    ...(raw.Resultado === undefined ? {} : { result: String(raw.Resultado) }),
    ...(raw.CAE === undefined ? {} : { cae: String(raw.CAE) }),
    ...(raw.CAEFchVto === undefined
      ? {}
      : { caeExpiry: String(raw.CAEFchVto) }),
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

function getWsfeResultEntries(
  result: Record<string, unknown>,
  key: string
): Record<string, unknown>[] {
  const rawEntries = (
    result.ResultGet as Record<string, unknown> | undefined
  )?.[key];
  if (!rawEntries) {
    return [];
  }

  return (Array.isArray(rawEntries) ? rawEntries : [rawEntries]).map(
    (entry) => entry as Record<string, unknown>
  );
}
