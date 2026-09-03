import { describe, expect, expectTypeOf, it } from "vitest";
import {
  ARCA_CONCEPT_TYPES,
  ARCA_CURRENCY_IDS,
  ARCA_DOCUMENT_TYPES,
  ARCA_RECEIVER_VAT_CONDITIONS,
  ARCA_VAT_RATES,
  ARCA_VOUCHER_TYPES,
} from "../constants";
import {
  type BuildFacturaBInput,
  buildFacturaB,
  buildFacturaC,
} from "./wsfe-builders";

function createBaseInput() {
  return {
    salesPoint: 1,
    concept: ARCA_CONCEPT_TYPES.PRODUCTOS,
    documentType: ARCA_DOCUMENT_TYPES.CONSUMIDOR_FINAL,
    documentNumber: 0,
    receiverVatConditionId: ARCA_RECEIVER_VAT_CONDITIONS.CONSUMIDOR_FINAL,
    voucherDate: "2026-09-02" as const,
  };
}

describe("WSFE invoice builders", () => {
  it("builds a default-ARS Factura B from integer minor units", () => {
    const input = {
      ...createBaseInput(),
      taxableAmount: 10_000,
      vatRate: 21 as const,
    };
    const snapshot = { ...input };

    const result = buildFacturaB(input);

    expect(result).toEqual({
      ...createBaseInput(),
      voucherType: ARCA_VOUCHER_TYPES.FACTURA_B,
      totalAmount: 121,
      nonTaxableAmount: 0,
      netAmount: 100,
      exemptAmount: 0,
      taxAmount: 0,
      vatAmount: 21,
      currencyId: ARCA_CURRENCY_IDS.ARS,
      exchangeRate: "1",
      vatRates: [
        {
          id: ARCA_VAT_RATES.IVA_21,
          baseAmount: 100,
          amount: 21,
        },
      ],
    });
    expect(input).toEqual(snapshot);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.vatRates)).toBe(true);
    expect(Object.isFrozen(result.vatRates?.[0])).toBe(true);
  });

  it.each([
    [0, ARCA_VAT_RATES.IVA_0, 0],
    [2.5, ARCA_VAT_RATES.IVA_2_5, 2.5],
    [5, ARCA_VAT_RATES.IVA_5, 5],
    [10.5, ARCA_VAT_RATES.IVA_10_5, 10.5],
    [21, ARCA_VAT_RATES.IVA_21, 21],
    [27, ARCA_VAT_RATES.IVA_27, 27],
  ] as const)("maps the %s%% VAT rate to its ARCA detail", (vatRate, id, expectedVat) => {
    const result = buildFacturaB({
      ...createBaseInput(),
      taxableAmount: 10_000,
      vatRate,
    });

    expect(result.vatAmount).toBe(expectedVat);
    expect(result.totalAmount).toBe(100 + expectedVat);
    expect(result.vatRates).toEqual([
      { id, baseAmount: 100, amount: expectedVat },
    ]);
  });

  it("rounds exact half-cent VAT to the even cent", () => {
    expect(
      buildFacturaB({
        ...createBaseInput(),
        taxableAmount: 50,
        vatRate: 21,
      })
    ).toMatchObject({ netAmount: 0.5, vatAmount: 0.1, totalAmount: 0.6 });
    expect(
      buildFacturaB({
        ...createBaseInput(),
        taxableAmount: 150,
        vatRate: 21,
      })
    ).toMatchObject({ netAmount: 1.5, vatAmount: 0.32, totalAmount: 1.82 });
  });

  it.each([
    [1, 21],
    [19, 2.5],
    [10, 5],
  ] as const)("rejects %s minor units at %s%% when positive-rate VAT rounds to zero", (taxableAmount, vatRate) => {
    expect(() =>
      buildFacturaB({
        ...createBaseInput(),
        taxableAmount,
        vatRate,
      })
    ).toThrowError(
      expect.objectContaining({
        code: "ARCA_INPUT_INVALID_AMOUNT",
        field: "taxableAmount",
      })
    );
  });

  it.each([
    0, 21,
  ] as const)("rejects a zero taxable Factura B at %s%% before building an IVA detail", (vatRate) => {
    expect(() =>
      buildFacturaB({
        ...createBaseInput(),
        taxableAmount: 0,
        vatRate,
      })
    ).toThrowError(
      expect.objectContaining({
        code: "ARCA_INPUT_INVALID_AMOUNT",
        field: "taxableAmount",
      })
    );
  });

  it("builds USD invoices with either a quotation or same-currency cancellation", () => {
    const quoted = buildFacturaB({
      ...createBaseInput(),
      taxableAmount: 10_000,
      vatRate: 21,
      currency: "USD",
      exchangeRate: "1095.500000",
    });
    const sameCurrency = buildFacturaB({
      ...createBaseInput(),
      taxableAmount: 10_000,
      vatRate: 21,
      currency: "USD",
      sameCurrencyForeignCancellation: true,
    });

    expect(quoted).toMatchObject({
      currencyId: ARCA_CURRENCY_IDS.USD,
      exchangeRate: "1095.5",
    });
    expect(quoted).not.toHaveProperty("sameCurrencyForeignCancellation");
    expect(sameCurrency).toMatchObject({
      currencyId: ARCA_CURRENCY_IDS.USD,
      sameCurrencyForeignCancellation: "S",
    });
    expect(sameCurrency).not.toHaveProperty("exchangeRate");
  });

  it.each([
    {
      overrides: { currency: "ARS", exchangeRate: "1" },
      code: "ARCA_INPUT_INVALID_EXCHANGE_RATE",
      field: "exchangeRate",
    },
    {
      overrides: { currency: "USD" },
      code: "ARCA_INPUT_MISSING_FIELD",
      field: "exchangeRate",
    },
    {
      overrides: {
        currency: "USD",
        exchangeRate: "1000",
        sameCurrencyForeignCancellation: true,
      },
      code: "ARCA_INPUT_INVALID_EXCHANGE_RATE",
      field: "exchangeRate",
    },
    {
      overrides: { currency: "EUR", exchangeRate: "1" },
      code: "ARCA_INPUT_INVALID_VALUE",
      field: "currency",
    },
  ])("rejects invalid runtime currency combinations", ({
    overrides,
    code,
    field,
  }) => {
    expect(() =>
      buildFacturaB({
        ...createBaseInput(),
        taxableAmount: 10_000,
        vatRate: 21,
        ...overrides,
      } as BuildFacturaBInput)
    ).toThrowError(expect.objectContaining({ code, field }));
  });

  it("rejects invalid builder amounts", () => {
    for (const taxableAmount of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() =>
        buildFacturaB({
          ...createBaseInput(),
          taxableAmount,
          vatRate: 21,
        })
      ).toThrowError(
        expect.objectContaining({
          code: "ARCA_INPUT_INVALID_AMOUNT",
          field: "taxableAmount",
        })
      );
    }

    expect(() =>
      buildFacturaB({
        ...createBaseInput(),
        taxableAmount: 999_999_999_999_999,
        vatRate: 21,
      })
    ).toThrowError(
      expect.objectContaining({
        code: "ARCA_INPUT_INVALID_AMOUNT",
        field: "totalAmount",
      })
    );
  });

  it("builds zero and positive Factura C subtotals without VAT detail", () => {
    const zero = buildFacturaC({ ...createBaseInput(), amount: 0 });
    const positive = buildFacturaC({ ...createBaseInput(), amount: 10_000 });

    expect(zero).toMatchObject({
      voucherType: ARCA_VOUCHER_TYPES.FACTURA_C,
      totalAmount: 0,
      netAmount: 0,
      vatAmount: 0,
      currencyId: ARCA_CURRENCY_IDS.ARS,
      exchangeRate: "1",
    });
    expect(positive).toMatchObject({
      voucherType: ARCA_VOUCHER_TYPES.FACTURA_C,
      totalAmount: 100,
      nonTaxableAmount: 0,
      netAmount: 100,
      exemptAmount: 0,
      taxAmount: 0,
      vatAmount: 0,
    });
    expect(positive).not.toHaveProperty("vatRates");
    expect(Object.isFrozen(positive)).toBe(true);
  });

  it("rejects invalid currency combinations at typecheck time", () => {
    type BaseFacturaB = ReturnType<typeof createBaseInput> & {
      taxableAmount: number;
      vatRate: 21;
    };

    expectTypeOf<
      BaseFacturaB & { currency: "USD" }
    >().not.toMatchTypeOf<BuildFacturaBInput>();
    expectTypeOf<
      BaseFacturaB & { currency: "ARS"; exchangeRate: string }
    >().not.toMatchTypeOf<BuildFacturaBInput>();
  });
});
