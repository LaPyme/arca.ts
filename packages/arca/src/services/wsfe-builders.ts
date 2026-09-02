import {
  ARCA_CURRENCY_IDS,
  ARCA_VAT_RATES,
  ARCA_VOUCHER_TYPES,
} from "../constants";
import { ArcaInputError } from "../errors";
import {
  arcaMinorUnitsToNumber,
  assertArcaMinorUnits,
  calculateVatMinorUnits,
  type SupportedVatRate,
  serializeArcaExchangeRate,
} from "../internal/decimal";
import type { WsfeDateInput, WsfeVatRate, WsfeVoucherInput } from "./wsfe";

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

const VAT_RATE_IDS: Record<SupportedVatRate, number> = {
  0: ARCA_VAT_RATES.IVA_0,
  2.5: ARCA_VAT_RATES.IVA_2_5,
  5: ARCA_VAT_RATES.IVA_5,
  10.5: ARCA_VAT_RATES.IVA_10_5,
  21: ARCA_VAT_RATES.IVA_21,
  27: ARCA_VAT_RATES.IVA_27,
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
  const totalMinorUnits = taxableMinorUnits + vatMinorUnits;
  const vatRateId = VAT_RATE_IDS[input.vatRate];

  if (vatRateId === undefined) {
    throw new ArcaInputError("vatRate is not a supported VAT rate.", {
      code: "ARCA_INPUT_INVALID_VALUE",
      field: "vatRate",
      expected: "one of 0, 2.5, 5, 10.5, 21, or 27",
    });
  }

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

  const vatRates: WsfeVatRate[] = [
    Object.freeze({
      id: vatRateId,
      baseAmount: arcaMinorUnitsToNumber(taxableMinorUnits, "taxableAmount"),
      amount: arcaMinorUnitsToNumber(vatMinorUnits, "vatAmount"),
    }),
  ];
  Object.freeze(vatRates);

  return Object.freeze({
    ...buildCommonExactInput(input),
    voucherType: ARCA_VOUCHER_TYPES.FACTURA_B,
    totalAmount: arcaMinorUnitsToNumber(totalMinorUnits, "totalAmount"),
    nonTaxableAmount: 0,
    netAmount: arcaMinorUnitsToNumber(taxableMinorUnits, "taxableAmount"),
    exemptAmount: 0,
    taxAmount: 0,
    vatAmount: arcaMinorUnitsToNumber(vatMinorUnits, "vatAmount"),
    vatRates,
  });
}

/** Builds a narrow Factura C exact WSFE input from integer currency minor units. */
export function buildFacturaC(input: BuildFacturaCInput): WsfeVoucherInput {
  const amountMinorUnits = assertArcaMinorUnits(input.amount, "amount");
  const amount = arcaMinorUnitsToNumber(amountMinorUnits, "amount");

  return Object.freeze({
    ...buildCommonExactInput(input),
    voucherType: ARCA_VOUCHER_TYPES.FACTURA_C,
    totalAmount: amount,
    nonTaxableAmount: 0,
    // ARCA defines ImpNeto as the subtotal for class C vouchers.
    netAmount: amount,
    exemptAmount: 0,
    taxAmount: 0,
    vatAmount: 0,
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
