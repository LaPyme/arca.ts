import { ARCA_CURRENCY_IDS, ARCA_VOUCHER_TYPES } from "../constants";
import { ArcaInputError } from "../errors";
import {
  assertArcaMinorUnits,
  calculateVatMinorUnits,
  type SupportedVatRate,
  serializeArcaExchangeRate,
} from "../internal/decimal";
import type { WsfeDateInput, WsfeVoucherInput } from "./wsfe";
import { calculateWsfeAmounts } from "./wsfe-amounts";

export type WsfeBuilderCurrencyInput =
  | {
      currency?: "ARS";
      exchangeRate?: never;
      sameCurrencyForeignCancellation?: never;
    }
  | {
      currency: "USD";
      exchangeRate: string;
      sameCurrencyForeignCancellation?: false;
    }
  | {
      currency: "USD";
      exchangeRate?: never;
      sameCurrencyForeignCancellation: true;
    };

export type WsfeBuilderVatRate = SupportedVatRate;

type WsfeInvoiceBuilderBaseInput = {
  salesPoint: number;
  concept: number;
  documentType: number;
  documentNumber: number;
  receiverVatConditionId: number;
  voucherDate: WsfeDateInput;
  serviceStartDate?: WsfeDateInput;
  serviceEndDate?: WsfeDateInput;
  paymentDueDate?: WsfeDateInput;
};

export type BuildFacturaBInput = WsfeInvoiceBuilderBaseInput &
  WsfeBuilderCurrencyInput & {
    /** Positive integer currency minor units forming the taxable base. */
    taxableAmount: number;
    vatRate: WsfeBuilderVatRate;
  };

export type BuildFacturaCInput = WsfeInvoiceBuilderBaseInput &
  WsfeBuilderCurrencyInput & {
    amount: number;
  };

/** Builds a narrow Factura B exact WSFE input from integer currency minor units. */
export function buildFacturaB(input: BuildFacturaBInput): WsfeVoucherInput {
  const taxableMinorUnits = assertArcaMinorUnits(
    input.taxableAmount,
    "taxableAmount"
  );
  if (taxableMinorUnits === 0n) {
    throw new ArcaInputError(
      "taxableAmount must be greater than zero for Factura B.",
      {
        code: "ARCA_INPUT_INVALID_AMOUNT",
        field: "taxableAmount",
        expected: "a positive safe integer in currency minor units",
      }
    );
  }

  const vatMinorUnits = calculateVatMinorUnits(
    taxableMinorUnits,
    input.vatRate,
    "vatRate"
  );
  if (input.vatRate !== 0 && vatMinorUnits === 0n) {
    throw new ArcaInputError(
      "taxableAmount is too small to produce VAT at the selected positive vatRate.",
      {
        code: "ARCA_INPUT_INVALID_AMOUNT",
        field: "taxableAmount",
        expected:
          "an amount that rounds to at least one currency minor unit of VAT for a positive vatRate",
      }
    );
  }

  const { data } = calculateWsfeAmounts({
    issuer: "responsable_inscripto",
    items: [{ net: input.taxableAmount, vat: input.vatRate }],
  });
  for (const rate of data.vatRates ?? []) {
    Object.freeze(rate);
  }
  Object.freeze(data.vatRates);
  return Object.freeze({
    ...buildCommonExactInput(input),
    voucherType: ARCA_VOUCHER_TYPES.FACTURA_B,
    ...data,
  });
}

/** Builds a narrow Factura C exact WSFE input from integer currency minor units. */
export function buildFacturaC(input: BuildFacturaCInput): WsfeVoucherInput {
  assertArcaMinorUnits(input.amount, "amount");
  const { data } = calculateWsfeAmounts({
    issuer: "monotributo",
    items: [{ amount: input.amount }],
  });
  return Object.freeze({
    ...buildCommonExactInput(input),
    voucherType: ARCA_VOUCHER_TYPES.FACTURA_C,
    ...data,
  });
}

function buildCommonExactInput(
  input: WsfeInvoiceBuilderBaseInput & WsfeBuilderCurrencyInput
): Pick<
  WsfeVoucherInput,
  | "salesPoint"
  | "concept"
  | "documentType"
  | "documentNumber"
  | "receiverVatConditionId"
  | "voucherDate"
  | "currencyId"
  | "exchangeRate"
  | "sameCurrencyForeignCancellation"
  | "serviceStartDate"
  | "serviceEndDate"
  | "paymentDueDate"
> {
  return {
    salesPoint: input.salesPoint,
    concept: input.concept,
    documentType: input.documentType,
    documentNumber: input.documentNumber,
    receiverVatConditionId: input.receiverVatConditionId,
    voucherDate: input.voucherDate,
    ...normalizeBuilderCurrency(input),
    ...(input.serviceStartDate === undefined
      ? {}
      : { serviceStartDate: input.serviceStartDate }),
    ...(input.serviceEndDate === undefined
      ? {}
      : { serviceEndDate: input.serviceEndDate }),
    ...(input.paymentDueDate === undefined
      ? {}
      : { paymentDueDate: input.paymentDueDate }),
  };
}

function normalizeBuilderCurrency(
  input: WsfeBuilderCurrencyInput
): Pick<
  WsfeVoucherInput,
  "currencyId" | "exchangeRate" | "sameCurrencyForeignCancellation"
> {
  const unsafeInput = input as {
    currency?: string;
    exchangeRate?: unknown;
    sameCurrencyForeignCancellation?: unknown;
  };
  const currency = unsafeInput.currency ?? "ARS";

  if (
    unsafeInput.sameCurrencyForeignCancellation !== undefined &&
    typeof unsafeInput.sameCurrencyForeignCancellation !== "boolean"
  ) {
    throw new ArcaInputError(
      "sameCurrencyForeignCancellation must be a boolean when provided.",
      {
        code: "ARCA_INPUT_INVALID_VALUE",
        field: "sameCurrencyForeignCancellation",
        expected: "true, false, or omitted",
      }
    );
  }

  if (currency === "ARS") {
    if (unsafeInput.exchangeRate !== undefined) {
      throw new ArcaInputError(
        "exchangeRate must be omitted when currency is ARS.",
        {
          code: "ARCA_INPUT_INVALID_EXCHANGE_RATE",
          field: "exchangeRate",
          expected: "omitted when currency is ARS",
        }
      );
    }
    if (unsafeInput.sameCurrencyForeignCancellation !== undefined) {
      throw new ArcaInputError(
        "sameCurrencyForeignCancellation applies only when currency is USD.",
        {
          code: "ARCA_INPUT_INVALID_VALUE",
          field: "sameCurrencyForeignCancellation",
          expected: "omitted when currency is ARS",
        }
      );
    }

    return {
      currencyId: ARCA_CURRENCY_IDS.ARS,
      exchangeRate: "1",
    };
  }

  if (currency !== "USD") {
    throw new ArcaInputError("currency is not supported by this builder.", {
      code: "ARCA_INPUT_INVALID_VALUE",
      field: "currency",
      expected: "ARS or USD",
    });
  }

  if (unsafeInput.sameCurrencyForeignCancellation === true) {
    if (unsafeInput.exchangeRate !== undefined) {
      throw new ArcaInputError(
        "exchangeRate must be omitted for same-currency foreign cancellation.",
        {
          code: "ARCA_INPUT_INVALID_EXCHANGE_RATE",
          field: "exchangeRate",
          expected: "omitted when sameCurrencyForeignCancellation is true",
        }
      );
    }

    return {
      currencyId: ARCA_CURRENCY_IDS.USD,
      sameCurrencyForeignCancellation: "S",
    };
  }

  if (typeof unsafeInput.exchangeRate !== "string") {
    throw new ArcaInputError("exchangeRate is required for USD invoices.", {
      code: "ARCA_INPUT_MISSING_FIELD",
      field: "exchangeRate",
      expected:
        "a decimal string unless sameCurrencyForeignCancellation is true",
    });
  }

  return {
    currencyId: ARCA_CURRENCY_IDS.USD,
    exchangeRate: serializeArcaExchangeRate(
      unsafeInput.exchangeRate,
      "exchangeRate"
    ),
    ...(unsafeInput.sameCurrencyForeignCancellation === false
      ? { sameCurrencyForeignCancellation: "N" as const }
      : {}),
  };
}
