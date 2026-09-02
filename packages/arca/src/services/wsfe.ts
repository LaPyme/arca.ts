import {
  ArcaInputError,
  ArcaInvalidSoapResponseError,
  ArcaServiceError,
  ArcaSoapFaultError,
  ArcaTransportError,
} from "../errors";
import type { ArcaClientConfig, ArcaRepresentedTaxId } from "../internal/types";
import type { SoapTransport } from "../soap";
import type { WsaaAuthModule } from "../wsaa";
import type {
  ArcaAuthorizationIndeterminateReason,
  ArcaAuthorizationOutcome,
  ArcaFiscalIssue,
  ArcaFiscalResultLevel,
  ArcaVoucherLookupResult,
} from "./fiscal-evidence";

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

/** An associated period used by WSFE credit/debit notes without associated vouchers. */
export type WsfeAssociatedPeriod = {
  startDate: WsfeDateInput;
  endDate: WsfeDateInput;
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

/** An activity associated with a WSFE invoice request. */
export type WsfeActivity = {
  id: number;
};

/** Input data for authorizing a WSFE voucher. */
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
  exchangeRate?: number;
  sameCurrencyForeignCancellation?: "S" | "N";
  serviceStartDate?: WsfeDateInput;
  serviceEndDate?: WsfeDateInput;
  paymentDueDate?: WsfeDateInput;
  associatedVouchers?: WsfeAssociatedVoucher[];
  associatedPeriod?: WsfeAssociatedPeriod;
  taxes?: WsfeTax[];
  vatRates?: WsfeVatRate[];
  optionalFields?: WsfeOptionalField[];
  buyers?: WsfeBuyer[];
  activities?: WsfeActivity[];
};

/** Input for authorizing a WSFE voucher with an explicit voucher number. */
export type WsfeAuthorizeVoucherInput = {
  representedTaxId?: number | string;
  data: WsfeVoucherInput;
  voucherNumber: number;
  forceRefresh?: boolean;
};

/** Result of a successful WSFE voucher authorization. */
export type WsfeAuthorizationResult = {
  cae: string;
  caeExpiry: string;
  voucherNumber: number;
  raw: Record<string, unknown>;
};

/** Structured evidence from one exact WSFE authorization attempt. */
export type WsfeAuthorizationOutcome = ArcaAuthorizationOutcome<"wsfe">;

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
  concept?: number;
  documentType?: number;
  documentNumber?: string;
  receiverVatConditionId?: number;
  totalAmount?: number;
  nonTaxableAmount?: number;
  netAmount?: number;
  exemptAmount?: number;
  taxAmount?: number;
  vatAmount?: number;
  currencyId?: string;
  exchangeRate?: number;
  result?: string;
  cae?: string;
  caeExpiry?: string;
  raw: Record<string, unknown>;
};

/** Typed exact-voucher consultation result for WSFE. */
export type WsfeVoucherLookupResult = ArcaVoucherLookupResult<
  WsfeVoucherInfo,
  "wsfe"
>;

export type WsfeCatalogEntry = {
  id: number;
  description: string;
};

export type WsfeActivityType = WsfeCatalogEntry & {
  order: number;
};

export type WsfeReceiverVatCondition = WsfeCatalogEntry & {
  voucherClass: string;
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
  /**
   * Attempts one exact authorization without transport retries and returns
   * structured provider evidence instead of flattening the result to throw/success.
   */
  authorizeVoucherOutcome(
    input: WsfeAuthorizeVoucherInput
  ): Promise<WsfeAuthorizationOutcome>;
  /** Authorizes a voucher with the explicit number sent as `CbteDesde` and `CbteHasta`. */
  authorizeVoucher(
    input: WsfeAuthorizeVoucherInput
  ): Promise<WsfeAuthorizationResult>;
  /** Authorizes a new voucher by fetching the next number and requesting a CAE. */
  createNextVoucher(input: {
    representedTaxId?: number | string;
    data: WsfeVoucherInput;
    forceRefresh?: boolean;
  }): Promise<WsfeAuthorizationResult>;
  /** Returns the next available voucher number for the given sales point and type. */
  getNextVoucherNumber(input: {
    representedTaxId?: number | string;
    salesPoint: number;
    voucherType: number;
    forceRefresh?: boolean;
  }): Promise<number>;
  /**
   * @deprecated Use `getNextVoucherNumber()` instead.
   * Returns the next available voucher number, not the last authorized one.
   */
  getLastVoucher(input: {
    representedTaxId?: number | string;
    salesPoint: number;
    voucherType: number;
    forceRefresh?: boolean;
  }): Promise<number>;
  /** Lists all configured points of sale for the taxpayer. */
  getSalesPoints(input: {
    representedTaxId?: number | string;
    forceRefresh?: boolean;
  }): Promise<WsfeSalesPoint[]>;
  /** Lists voucher types accepted by WSFE. */
  getVoucherTypes(input: {
    representedTaxId?: number | string;
    forceRefresh?: boolean;
  }): Promise<WsfeCatalogEntry[]>;
  /** Lists document types accepted by WSFE. */
  getDocumentTypes(input: {
    representedTaxId?: number | string;
    forceRefresh?: boolean;
  }): Promise<WsfeCatalogEntry[]>;
  /** Lists concept types accepted by WSFE. */
  getConceptTypes(input: {
    representedTaxId?: number | string;
    forceRefresh?: boolean;
  }): Promise<WsfeCatalogEntry[]>;
  /** Lists supported currency types. */
  getCurrencyTypes(input: {
    representedTaxId?: number | string;
    forceRefresh?: boolean;
  }): Promise<WsfeCurrencyType[]>;
  /** Lists VAT rates accepted by WSFE. */
  getVatRates(input: {
    representedTaxId?: number | string;
    forceRefresh?: boolean;
  }): Promise<WsfeCatalogEntry[]>;
  /** Lists tax types accepted by WSFE. */
  getTaxTypes(input: {
    representedTaxId?: number | string;
    forceRefresh?: boolean;
  }): Promise<WsfeCatalogEntry[]>;
  /** Lists optional field types accepted by WSFE. */
  getOptionalTypes(input: {
    representedTaxId?: number | string;
    forceRefresh?: boolean;
  }): Promise<WsfeCatalogEntry[]>;
  /** Lists activities enabled for the taxpayer. */
  getActivities(input: {
    representedTaxId?: number | string;
    forceRefresh?: boolean;
  }): Promise<WsfeActivityType[]>;
  /** Lists receiver VAT condition values accepted by WSFE. */
  getReceiverVatConditions(input: {
    representedTaxId?: number | string;
    voucherClass?: string;
    forceRefresh?: boolean;
  }): Promise<WsfeReceiverVatCondition[]>;
  /** Reports WSFE backend status without requiring taxpayer authorization. */
  getServerStatus(): Promise<WsfeServerStatus>;
  /** Returns the exchange rate for a given currency. */
  getQuotation(input: {
    currencyId: string;
    representedTaxId?: number | string;
    forceRefresh?: boolean;
  }): Promise<WsfeQuotation>;
  /** Retrieves details for a specific voucher. Returns `null` if not found. */
  getVoucherInfo(input: {
    representedTaxId?: number | string;
    number: number;
    salesPoint: number;
    voucherType: number;
    forceRefresh?: boolean;
  }): Promise<WsfeVoucherInfo | null>;
  /** Consults one exact voucher and normalizes WSFE error 602 to `not_found`. */
  lookupVoucher(input: {
    representedTaxId?: number | string;
    number: number;
    salesPoint: number;
    voucherType: number;
    forceRefresh?: boolean;
  }): Promise<WsfeVoucherLookupResult>;
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

type NormalizedWsfeAssociatedPeriod = {
  startDate: string;
  endDate: string;
};

type NormalizedWsfeVoucherInput = Omit<
  WsfeVoucherInput,
  | "voucherDate"
  | "serviceStartDate"
  | "serviceEndDate"
  | "paymentDueDate"
  | "associatedVouchers"
  | "associatedPeriod"
> & {
  voucherDate: string;
  serviceStartDate?: string;
  serviceEndDate?: string;
  paymentDueDate?: string;
  associatedVouchers?: NormalizedWsfeAssociatedVoucher[];
  associatedPeriod?: NormalizedWsfeAssociatedPeriod;
};

/** Creates a WSFE service instance wired with authentication and SOAP transport. */
export function createWsfeService(
  options: CreateWsfeServiceOptions
): WsfeService {
  async function executeWsfeAuthenticatedRawOperation(
    operation: string,
    input: {
      representedTaxId?: ArcaRepresentedTaxId;
      forceRefresh?: boolean;
    },
    body: Record<string, unknown> = {},
    retries?: number
  ) {
    const auth = await options.auth.login("wsfe", {
      representedTaxId: input.representedTaxId,
      forceRefresh: input.forceRefresh,
    });
    const response = await options.soap.execute<
      Record<string, unknown>,
      Record<string, unknown>
    >({
      service: "wsfe",
      operation,
      ...(retries === undefined ? {} : { retries }),
      body: {
        Auth: createWsfeAuth(
          input.representedTaxId ?? options.config.taxId,
          auth.token,
          auth.sign
        ),
        ...body,
      },
    });

    return unwrapWsfeOperationEnvelope(operation, response.result);
  }

  async function executeWsfeAuthenticatedOperation(
    operation: string,
    input: {
      representedTaxId?: ArcaRepresentedTaxId;
      forceRefresh?: boolean;
    },
    body: Record<string, unknown> = {}
  ) {
    const result = await executeWsfeAuthenticatedRawOperation(
      operation,
      input,
      body
    );
    throwForWsfeOperationErrors(operation, result);
    return result;
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

    const result = unwrapWsfeOperationEnvelope(operation, response.result);
    throwForWsfeOperationErrors(operation, result);
    return result;
  }

  async function getNextVoucherNumber({
    representedTaxId,
    salesPoint,
    voucherType,
    forceRefresh,
  }: {
    representedTaxId?: number | string;
    salesPoint: number;
    voucherType: number;
    forceRefresh?: boolean;
  }) {
    const result = await executeWsfeAuthenticatedOperation(
      "FECompUltimoAutorizado",
      {
        representedTaxId,
        forceRefresh,
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
      forceRefresh?: boolean;
    }
  ): Promise<WsfeCatalogEntry[]> {
    const result = await executeWsfeAuthenticatedOperation(operation, {
      representedTaxId: input.representedTaxId,
      forceRefresh: input.forceRefresh,
    });
    return getWsfeResultEntries(result, resultKey).map(mapWsfeCatalogEntry);
  }

  function authorizeVoucher({
    representedTaxId,
    data,
    voucherNumber,
    forceRefresh,
  }: WsfeAuthorizeVoucherInput): Promise<WsfeAuthorizationResult> {
    const normalizedInput = normalizeWsfeVoucherInput(data);
    return authorizeNormalizedVoucher({
      representedTaxId,
      data: normalizedInput,
      voucherNumber,
      forceRefresh,
    });
  }

  function authorizeVoucherOutcome({
    representedTaxId,
    data,
    voucherNumber,
    forceRefresh,
  }: WsfeAuthorizeVoucherInput): Promise<WsfeAuthorizationOutcome> {
    const normalizedInput = normalizeWsfeVoucherInput(data);
    return executeWsfeAuthorization({
      representedTaxId,
      data: normalizedInput,
      voucherNumber,
      forceRefresh,
    }).then(({ outcome }) => outcome);
  }

  async function authorizeNormalizedVoucher({
    representedTaxId,
    data: normalizedInput,
    voucherNumber,
    forceRefresh,
  }: {
    representedTaxId?: number | string;
    data: NormalizedWsfeVoucherInput;
    voucherNumber: number;
    forceRefresh?: boolean;
  }): Promise<WsfeAuthorizationResult> {
    const execution = await executeWsfeAuthorization({
      representedTaxId,
      data: normalizedInput,
      voucherNumber,
      forceRefresh,
    });

    if (execution.error) {
      throw execution.error;
    }

    if (execution.outcome.kind !== "authorized") {
      throw createWsfeOutcomeError(execution.outcome);
    }

    const { cae, caeExpiry, raw } = execution.outcome;
    if (!(caeExpiry && raw)) {
      throw new ArcaServiceError("WSFE did not return CAE authorization data", {
        service: "wsfe",
        operation: "FECAESolicitar",
        result: execution.outcome.result,
        resultLevel: execution.outcome.resultLevel,
        results: execution.outcome.results,
        cae,
        issues: [
          ...execution.outcome.errors,
          ...execution.outcome.observations,
        ],
        detail: raw,
      });
    }

    return {
      cae,
      caeExpiry,
      voucherNumber,
      raw,
    };
  }

  async function executeWsfeAuthorization({
    representedTaxId,
    data: normalizedInput,
    voucherNumber,
    forceRefresh,
  }: {
    representedTaxId?: number | string;
    data: NormalizedWsfeVoucherInput;
    voucherNumber: number;
    forceRefresh?: boolean;
  }): Promise<{
    outcome: WsfeAuthorizationOutcome;
    error?: unknown;
  }> {
    const requestData = mapWsfeVoucherInput(normalizedInput, voucherNumber);

    try {
      const result = await executeWsfeAuthenticatedRawOperation(
        "FECAESolicitar",
        { representedTaxId, forceRefresh },
        {
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
        0
      );

      return {
        outcome: classifyWsfeAuthorization(result, voucherNumber),
      };
    } catch (error) {
      return {
        outcome: createWsfeIndeterminateOutcome(error),
        error,
      };
    }
  }

  async function lookupVoucher({
    representedTaxId,
    number,
    salesPoint,
    voucherType,
    forceRefresh,
  }: {
    representedTaxId?: number | string;
    number: number;
    salesPoint: number;
    voucherType: number;
    forceRefresh?: boolean;
  }): Promise<WsfeVoucherLookupResult> {
    const operation = "FECompConsultar";
    const result = await executeWsfeAuthenticatedRawOperation(
      operation,
      { representedTaxId, forceRefresh },
      {
        FeCompConsReq: {
          CbteNro: number,
          PtoVta: salesPoint,
          CbteTipo: voucherType,
        },
      }
    );
    const errors = extractWsfeGlobalIssues(result, operation);

    if (errors.length > 0 && errors.every((issue) => issue.code === "602")) {
      return {
        kind: "not_found",
        service: "wsfe",
        operation,
        errors,
        observations: [],
        raw: result,
      };
    }

    if (errors.length > 0) {
      throw createWsfeServiceError(operation, result, errors);
    }

    const raw = toWsfeRecord(result.ResultGet);
    if (!raw) {
      throw new ArcaServiceError("WSFE did not return the consulted voucher", {
        service: "wsfe",
        operation,
        detail: result,
      });
    }

    return {
      kind: "found",
      service: "wsfe",
      operation,
      voucher: mapWsfeVoucherInfo(raw),
      observations: [],
      raw: result,
    };
  }

  return {
    authorizeVoucherOutcome,
    authorizeVoucher,
    async createNextVoucher({ representedTaxId, data, forceRefresh }) {
      const normalizedInput = normalizeWsfeVoucherInput(data);

      const voucherNumber = await getNextVoucherNumber({
        representedTaxId,
        salesPoint: normalizedInput.salesPoint,
        voucherType: normalizedInput.voucherType,
        forceRefresh,
      });

      return authorizeNormalizedVoucher({
        representedTaxId,
        data: normalizedInput,
        voucherNumber,
      });
    },
    getNextVoucherNumber,
    getLastVoucher(input) {
      return getNextVoucherNumber(input);
    },
    async getSalesPoints({ representedTaxId, forceRefresh }) {
      const result = await executeWsfeAuthenticatedOperation(
        "FEParamGetPtosVenta",
        {
          representedTaxId,
          forceRefresh,
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
    async getCurrencyTypes({ representedTaxId, forceRefresh }) {
      const result = await executeWsfeAuthenticatedOperation(
        "FEParamGetTiposMonedas",
        {
          representedTaxId,
          forceRefresh,
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
    async getActivities({ representedTaxId, forceRefresh }) {
      const result = await executeWsfeAuthenticatedOperation(
        "FEParamGetActividades",
        {
          representedTaxId,
          forceRefresh,
        }
      );
      return getWsfeResultEntries(result, "ActividadesTipo").map(
        mapWsfeActivityType
      );
    },
    async getReceiverVatConditions({
      representedTaxId,
      voucherClass,
      forceRefresh,
    }) {
      const result = await executeWsfeAuthenticatedOperation(
        "FEParamGetCondicionIvaReceptor",
        {
          representedTaxId,
          forceRefresh,
        },
        {
          ...(voucherClass === undefined ? {} : { ClaseCmp: voucherClass }),
        }
      );
      return getWsfeResultEntries(result, "CondicionIvaReceptor").map(
        mapWsfeReceiverVatCondition
      );
    },
    async getServerStatus() {
      const result = await executeWsfeOperation("FEDummy");
      return mapWsfeServerStatus(result);
    },
    async getQuotation({ currencyId, representedTaxId, forceRefresh }) {
      const result = await executeWsfeAuthenticatedOperation(
        "FEParamGetCotizacion",
        {
          representedTaxId,
          forceRefresh,
        },
        {
          MonId: currencyId,
        }
      );
      const raw =
        (result.ResultGet as Record<string, unknown> | undefined) ?? {};
      return mapWsfeQuotation(raw);
    },
    async getVoucherInfo(input) {
      const lookup = await lookupVoucher(input);
      return lookup.kind === "found" ? lookup.voucher : null;
    },
    lookupVoucher,
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
    PtoVta: input.salesPoint,
    CbteTipo: input.voucherType,
  };

  if (input.exchangeRate !== undefined) {
    data.MonCotiz = input.exchangeRate;
  }

  if (input.receiverVatConditionId !== undefined) {
    data.CondicionIVAReceptorId = input.receiverVatConditionId;
  }

  if (
    input.currencyId !== "PES" &&
    input.sameCurrencyForeignCancellation !== undefined
  ) {
    data.CanMisMonExt = input.sameCurrencyForeignCancellation;
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

  if (input.associatedPeriod) {
    data.PeriodoAsoc = {
      FchDesde: input.associatedPeriod.startDate,
      FchHasta: input.associatedPeriod.endDate,
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

  if (input.activities) {
    data.Actividades = {
      Actividad: input.activities.map((a) => ({
        Id: a.id,
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
    exchangeRate,
    serviceStartDate,
    serviceEndDate,
    paymentDueDate,
    associatedVouchers,
    associatedPeriod,
    ...rest
  } = input;
  const normalizedExchangeRate = normalizeWsfeExchangeRate(input, exchangeRate);

  return {
    ...rest,
    voucherDate: normalizeWsfeDateInput(voucherDate, "voucherDate"),
    ...(normalizedExchangeRate === undefined
      ? {}
      : { exchangeRate: normalizedExchangeRate }),
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
    ...(associatedPeriod === undefined
      ? {}
      : {
          associatedPeriod: {
            startDate: normalizeWsfeDateInput(
              associatedPeriod.startDate,
              "associatedPeriod.startDate"
            ),
            endDate: normalizeWsfeDateInput(
              associatedPeriod.endDate,
              "associatedPeriod.endDate"
            ),
          },
        }),
  };
}

function normalizeWsfeExchangeRate(
  input: Pick<
    WsfeVoucherInput,
    "currencyId" | "sameCurrencyForeignCancellation"
  >,
  exchangeRate: number | undefined
): number | undefined {
  if (input.currencyId === "PES") {
    if (exchangeRate !== undefined && exchangeRate !== 1) {
      throw new ArcaInputError(
        "exchangeRate must be 1 when currencyId is PES."
      );
    }
    return 1;
  }

  if (exchangeRate === undefined) {
    if (input.sameCurrencyForeignCancellation === "S") {
      return undefined;
    }
    throw new ArcaInputError(
      "exchangeRate is required unless sameCurrencyForeignCancellation is S for a foreign-currency voucher."
    );
  }

  if (!(Number.isFinite(exchangeRate) && exchangeRate > 0)) {
    throw new ArcaInputError(
      "exchangeRate must be a positive finite number for a foreign-currency voucher."
    );
  }

  return exchangeRate;
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

function mapWsfeActivityType(raw: unknown): WsfeActivityType {
  const record = raw as Record<string, unknown>;
  return {
    id: Number(record.Id ?? 0),
    description: String(record.Desc ?? ""),
    order: Number(record.Orden ?? 0),
  };
}

function mapWsfeReceiverVatCondition(raw: unknown): WsfeReceiverVatCondition {
  const record = raw as Record<string, unknown>;
  return {
    id: Number(record.Id ?? 0),
    description: String(record.Desc ?? ""),
    voucherClass: String(record.Cmp_Clase ?? ""),
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
  const voucher: WsfeVoucherInfo = {
    voucherNumber: Number(raw.CbteDesde ?? raw.CbteHasta ?? 0),
    raw,
  };

  assignWsfeValue(voucher, "voucherDate", normalizeWsfeString(raw.CbteFch));
  assignWsfeValue(voucher, "salesPoint", normalizeWsfeNumber(raw.PtoVta));
  assignWsfeValue(voucher, "voucherType", normalizeWsfeNumber(raw.CbteTipo));
  assignWsfeValue(voucher, "concept", normalizeWsfeNumber(raw.Concepto));
  assignWsfeValue(voucher, "documentType", normalizeWsfeNumber(raw.DocTipo));
  assignWsfeValue(voucher, "documentNumber", normalizeWsfeString(raw.DocNro));
  assignWsfeValue(
    voucher,
    "receiverVatConditionId",
    normalizeWsfeNumber(raw.CondicionIVAReceptorId)
  );
  assignWsfeValue(voucher, "totalAmount", normalizeWsfeNumber(raw.ImpTotal));
  assignWsfeValue(
    voucher,
    "nonTaxableAmount",
    normalizeWsfeNumber(raw.ImpTotConc)
  );
  assignWsfeValue(voucher, "netAmount", normalizeWsfeNumber(raw.ImpNeto));
  assignWsfeValue(voucher, "exemptAmount", normalizeWsfeNumber(raw.ImpOpEx));
  assignWsfeValue(voucher, "taxAmount", normalizeWsfeNumber(raw.ImpTrib));
  assignWsfeValue(voucher, "vatAmount", normalizeWsfeNumber(raw.ImpIVA));
  assignWsfeValue(voucher, "currencyId", normalizeWsfeString(raw.MonId));
  assignWsfeValue(voucher, "exchangeRate", normalizeWsfeNumber(raw.MonCotiz));
  assignWsfeValue(voucher, "result", normalizeWsfeString(raw.Resultado));
  assignWsfeValue(
    voucher,
    "cae",
    normalizeWsfeString(raw.CodAutorizacion ?? raw.CAE)
  );
  assignWsfeValue(
    voucher,
    "caeExpiry",
    normalizeWsfeString(raw.FchVto ?? raw.CAEFchVto)
  );

  return voucher;
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

function unwrapWsfeOperationEnvelope(
  operation: string,
  response: Record<string, unknown>
) {
  const operationResponse = response[`${operation}Response`] as
    | Record<string, unknown>
    | undefined;
  const result = (operationResponse?.[`${operation}Result`] ??
    response[`${operation}Result`] ??
    response) as Record<string, unknown>;

  return result;
}

function throwForWsfeOperationErrors(
  operation: string,
  result: Record<string, unknown>
) {
  const errors = extractWsfeGlobalIssues(result, operation);
  if (errors.length > 0) {
    throw createWsfeServiceError(operation, result, errors);
  }
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

function classifyWsfeAuthorization(
  result: Record<string, unknown>,
  voucherNumber: number
): WsfeAuthorizationOutcome {
  const operation = "FECAESolicitar";
  const header = toWsfeRecord(result.FeCabResp) ?? {};
  const detail = normalizeWsfeDetailResponse(result);
  const headerResult = normalizeWsfeResult(header.Resultado);
  const detailResult = normalizeWsfeResult(detail.Resultado);
  const resultCode = detailResult ?? headerResult;
  const resultLevel = getWsfeResultLevel(headerResult, detailResult);
  const cae = normalizeWsfeString(detail.CAE);
  const caeExpiry = normalizeWsfeString(detail.CAEFchVto);
  const errors = extractWsfeGlobalIssues(result, operation, "header");
  const observations = extractWsfeObservations(
    detail,
    detailResult === "R" ? "business" : "observation"
  );
  const hasInfrastructureError = errors.some(
    (issue) => issue.category === "infrastructure"
  );
  const base = {
    service: "wsfe" as const,
    operation,
    results: createWsfeResults(headerResult, detailResult),
    errors,
    observations,
    raw: result,
  };
  const context: WsfeAuthorizationContext = {
    base,
    headerResult,
    detailResult,
    resultCode,
    resultLevel,
    cae,
    caeExpiry,
  };

  if (hasContradictoryWsfeResults(context)) {
    return createWsfeStructuredIndeterminate(context, "contradictory_response");
  }

  if (hasInfrastructureError) {
    return createWsfeStructuredIndeterminate(context, "incomplete_response");
  }

  if (isAuthorizedWsfeContext(context)) {
    return {
      ...base,
      kind: "authorized",
      result: "A",
      resultLevel: "detail",
      cae: context.cae,
      caeExpiry: context.caeExpiry,
      voucherNumber,
    };
  }

  if (isRejectedWsfeDetailContext(context)) {
    return {
      ...base,
      kind: "rejected",
      result: "R",
      resultLevel: "detail",
    };
  }

  if (isRejectedWsfeHeaderContext(context)) {
    return {
      ...base,
      kind: "rejected",
      result: "R",
      resultLevel: "header",
    };
  }

  return createWsfeStructuredIndeterminate(
    context,
    hasWsfeCaeContradiction(context)
      ? "contradictory_response"
      : "incomplete_response"
  );
}

type WsfeAuthorizationContext = {
  base: {
    service: "wsfe";
    operation: string;
    results: { header?: string; detail?: string };
    errors: ArcaFiscalIssue[];
    observations: ArcaFiscalIssue[];
    raw: Record<string, unknown>;
  };
  headerResult?: string;
  detailResult?: string;
  resultCode?: string;
  resultLevel?: ArcaFiscalResultLevel;
  cae?: string;
  caeExpiry?: string;
};

function getWsfeResultLevel(
  headerResult?: string,
  detailResult?: string
): ArcaFiscalResultLevel | undefined {
  if (detailResult) {
    return "detail";
  }
  return headerResult ? "header" : undefined;
}

function hasContradictoryWsfeResults(context: WsfeAuthorizationContext) {
  return Boolean(
    context.headerResult &&
      context.detailResult &&
      context.headerResult !== context.detailResult
  );
}

function isAuthorizedWsfeContext(
  context: WsfeAuthorizationContext
): context is WsfeAuthorizationContext & { cae: string; caeExpiry: string } {
  return Boolean(
    context.detailResult === "A" &&
      context.headerResult !== "R" &&
      context.base.errors.length === 0 &&
      context.cae &&
      context.caeExpiry
  );
}

function isRejectedWsfeDetailContext(context: WsfeAuthorizationContext) {
  return (
    context.detailResult === "R" && context.headerResult !== "A" && !context.cae
  );
}

function isRejectedWsfeHeaderContext(context: WsfeAuthorizationContext) {
  return (
    context.headerResult === "R" &&
    context.detailResult === undefined &&
    !context.cae &&
    context.base.errors.length > 0 &&
    context.base.errors.every((issue) => issue.category === "business")
  );
}

function hasWsfeCaeContradiction(context: WsfeAuthorizationContext) {
  return (
    (context.resultCode === "A" || context.resultCode === "R") &&
    Boolean(context.cae)
  );
}

function createWsfeStructuredIndeterminate(
  context: WsfeAuthorizationContext,
  reason: ArcaAuthorizationIndeterminateReason
): WsfeAuthorizationOutcome {
  const outcome: WsfeAuthorizationOutcome = {
    ...context.base,
    kind: "indeterminate",
    reason,
  };
  assignWsfeValue(outcome, "result", context.resultCode);
  assignWsfeValue(outcome, "resultLevel", context.resultLevel);
  assignWsfeValue(outcome, "cae", context.cae);
  assignWsfeValue(outcome, "caeExpiry", context.caeExpiry);
  return outcome;
}

function createWsfeResults(headerResult?: string, detailResult?: string) {
  const results: { header?: string; detail?: string } = {};
  assignWsfeValue(results, "header", headerResult);
  assignWsfeValue(results, "detail", detailResult);
  return results;
}

function createWsfeIndeterminateOutcome(
  error: unknown
): WsfeAuthorizationOutcome {
  return {
    kind: "indeterminate",
    service: "wsfe",
    operation: "FECAESolicitar",
    results: {},
    reason: getArcaIndeterminateReason(error),
    errors: [],
    observations: [],
  };
}

function getArcaIndeterminateReason(
  error: unknown
): ArcaAuthorizationIndeterminateReason {
  if (error instanceof ArcaTransportError) {
    return "transport_error";
  }
  if (error instanceof ArcaSoapFaultError) {
    return "soap_fault";
  }
  if (error instanceof ArcaInvalidSoapResponseError) {
    return "invalid_response";
  }
  return "unexpected_error";
}

function createWsfeOutcomeError(
  outcome: Exclude<WsfeAuthorizationOutcome, { kind: "authorized" }>
) {
  const issues = [...outcome.errors, ...outcome.observations];
  const firstIssue = issues[0];
  const message = firstIssue
    ? formatWsfeIssue(firstIssue)
    : outcome.kind === "rejected"
      ? "WSFE rejected the voucher authorization"
      : outcome.result === "A"
        ? "WSFE did not return CAE authorization data"
        : "WSFE did not return conclusive voucher authorization data";

  return new ArcaServiceError(message, {
    service: "wsfe",
    operation: outcome.operation,
    ...(firstIssue?.code === undefined ? {} : { serviceCode: firstIssue.code }),
    ...(outcome.result === undefined ? {} : { result: outcome.result }),
    ...(outcome.resultLevel === undefined
      ? {}
      : { resultLevel: outcome.resultLevel }),
    results: outcome.results,
    ...(outcome.kind === "indeterminate" && outcome.cae
      ? { cae: outcome.cae }
      : {}),
    issues,
    detail: outcome.raw,
  });
}

function createWsfeServiceError(
  operation: string,
  result: Record<string, unknown>,
  issues: ArcaFiscalIssue[]
) {
  const firstIssue = issues[0];
  return new ArcaServiceError(
    firstIssue ? formatWsfeIssue(firstIssue) : "WSFE returned a service error",
    {
      service: "wsfe",
      operation,
      ...(firstIssue?.code === undefined
        ? {}
        : { serviceCode: firstIssue.code }),
      issues,
      detail: result,
    }
  );
}

function extractWsfeGlobalIssues(
  result: Record<string, unknown>,
  operation: string,
  resultLevel?: ArcaFiscalResultLevel
): ArcaFiscalIssue[] {
  const errorsContainer = toWsfeRecord(result.Errors);
  return normalizeWsfeIssueEntries(errorsContainer?.Err).map((entry) => ({
    service: "wsfe",
    operation,
    source: "error",
    category:
      operation === "FECAESolicitar" &&
      WSFE_AUTHORIZATION_INFRASTRUCTURE_CODES.has(entry.code ?? "")
        ? "infrastructure"
        : operation === "FECAESolicitar"
          ? "business"
          : "unknown",
    ...(entry.code === undefined ? {} : { code: entry.code }),
    message: entry.message,
    ...(resultLevel === undefined ? {} : { resultLevel }),
  }));
}

function extractWsfeObservations(
  detail: Record<string, unknown>,
  category: ArcaFiscalIssue["category"]
): ArcaFiscalIssue[] {
  const observationsContainer = toWsfeRecord(detail.Observaciones);
  return normalizeWsfeIssueEntries(observationsContainer?.Obs).map((entry) => ({
    service: "wsfe",
    operation: "FECAESolicitar",
    source: "observation",
    category,
    ...(entry.code === undefined ? {} : { code: entry.code }),
    message: entry.message,
    resultLevel: "detail",
  }));
}

function normalizeWsfeIssueEntries(rawErrors: unknown) {
  const entries = Array.isArray(rawErrors)
    ? rawErrors
    : rawErrors
      ? [rawErrors]
      : [];

  return entries
    .map((entry) => entry as Record<string, unknown>)
    .map((entry) => {
      const code = entry.Code ?? entry.code;
      const message = entry.Msg ?? entry.msg ?? "Unknown WSFE error";
      return {
        ...(code === undefined ? {} : { code: String(code) }),
        message: String(message),
      };
    });
}

function formatWsfeIssue(issue: ArcaFiscalIssue) {
  return issue.code ? `(${issue.code}) ${issue.message}` : issue.message;
}

function normalizeWsfeResult(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toUpperCase();
  return normalized || undefined;
}

function normalizeWsfeString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const normalized = String(value).trim();
  return normalized || undefined;
}

function normalizeWsfeNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : undefined;
}

function assignWsfeValue<TTarget, TKey extends keyof TTarget>(
  target: TTarget,
  key: TKey,
  value: TTarget[TKey] | undefined
) {
  if (value !== undefined) {
    target[key] = value;
  }
}

function toWsfeRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

const WSFE_AUTHORIZATION_INFRASTRUCTURE_CODES = new Set([
  "500",
  "501",
  "502",
  "600",
  "601",
]);

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
