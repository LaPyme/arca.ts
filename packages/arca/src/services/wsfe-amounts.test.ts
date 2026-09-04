import { describe, expect, it } from "vitest";
import {
  normalizeArcaAmountToMinorUnits,
  SUPPORTED_VAT_RATES,
} from "../internal/decimal";
import { normalizeWsfeVoucherInput } from "./wsfe";
import {
  type AmountItem,
  calculateWsfeAmounts,
  type VatItem,
} from "./wsfe-amounts";

const base = {
  salesPoint: 1,
  voucherType: 6,
  concept: 1,
  documentType: 99,
  documentNumber: 0,
  receiverVatConditionId: 5,
  voucherDate: "20260904" as const,
  currencyId: "PES",
  exchangeRate: "1",
};
const minor = (amount: number) =>
  Number(normalizeArcaAmountToMinorUnits(amount, "test"));

// Reproducible generated properties, including tiny values and all fiscal states.
function generatedSets(): VatItem[][] {
  let seed = 2048;
  const next = (max: number) => {
    seed = (seed * 48_271) % 2_147_483_647;
    return seed % max;
  };
  const rates = [...SUPPORTED_VAT_RATES, "exempt", "untaxed"] as const;
  return Array.from({ length: 1000 }, () =>
    Array.from({ length: next(30) + 1 }, () => {
      const vat = rates[next(rates.length)];
      const amount = next(2) === 0 ? next(100) : next(1_000_000);
      return next(2) === 0 ? { net: amount, vat } : { gross: amount, vat };
    })
  );
}

describe("WSFE amount core", () => {
  it("reconciles generated mixed item sets with the unchanged exact validator", () => {
    for (const items of generatedSets()) {
      const { data, amounts } = calculateWsfeAmounts({
        issuer: "responsable_inscripto",
        items,
      });
      expect(() =>
        normalizeWsfeVoucherInput({ ...base, ...data })
      ).not.toThrow();
      const rates = data.vatRates ?? [];
      expect(new Set(rates.map((rate) => rate.id)).size).toBe(rates.length);
      expect(minor(data.totalAmount)).toBe(amounts.computedTotal);
      expect(minor(data.totalAmount)).toBe(
        minor(data.netAmount) +
          minor(data.vatAmount) +
          minor(data.exemptAmount) +
          minor(data.nonTaxableAmount)
      );
      for (const adjustment of [-rates.length, rates.length]) {
        if (minor(data.vatAmount) + adjustment < 0) {
          continue;
        }
        const adjusted = calculateWsfeAmounts({
          issuer: "responsable_inscripto",
          items,
          total: amounts.computedTotal + adjustment,
        });
        expect(adjusted.amounts).toEqual({
          computedTotal: amounts.computedTotal,
          sentTotal: amounts.computedTotal + adjustment,
          vatAdjustment: adjustment + 0,
        });
        expect(minor(adjusted.data.vatAmount)).toBe(
          minor(data.vatAmount) + adjustment
        );
        expect(adjusted.data.vatRates).toEqual(data.vatRates);
        expect(() =>
          normalizeWsfeVoucherInput({ ...base, ...adjusted.data })
        ).not.toThrow();
      }
      for (const total of [
        amounts.computedTotal + rates.length + 1,
        amounts.computedTotal - rates.length - 1,
      ].filter((value) => value >= 0)) {
        expect(() =>
          calculateWsfeAmounts({
            issuer: "responsable_inscripto",
            items,
            total,
          })
        ).toThrowError(
          expect.objectContaining({
            code: "ARCA_INPUT_AMOUNT_MISMATCH",
            field: "total",
            expected: expect.stringContaining(String(amounts.computedTotal)),
          })
        );
      }
    }
  });

  it("preserves gross and net sums per rate across generated item sets", () => {
    for (const vat of SUPPORTED_VAT_RATES) {
      for (let value = 1; value <= 300; value++) {
        const gross = calculateWsfeAmounts({
          issuer: "responsable_inscripto",
          items: [
            { gross: value, vat },
            { gross: value + 1, vat },
          ],
        });
        expect(minor(gross.data.netAmount) + minor(gross.data.vatAmount)).toBe(
          value * 2 + 1
        );
        const net = calculateWsfeAmounts({
          issuer: "responsable_inscripto",
          items: [
            { net: value, vat },
            { net: value + 1, vat },
          ],
        });
        expect(minor(net.data.netAmount)).toBe(value * 2 + 1);
      }
    }
  });

  it("rounds Half Even after grouping, including mixed input and gross ties", () => {
    expect(
      calculateWsfeAmounts({
        issuer: "responsable_inscripto",
        items: [
          { net: 25, vat: 21 },
          { net: 25, vat: 21 },
        ],
      }).amounts.computedTotal
    ).toBe(60);
    expect(
      calculateWsfeAmounts({
        issuer: "responsable_inscripto",
        items: [{ net: 150, vat: 21 }],
      }).amounts.computedTotal
    ).toBe(182);
    // 2.46 / 1.025 = 2.40; 0.21 / 1.05 = 0.20.
    const mixed = calculateWsfeAmounts({
      issuer: "responsable_inscripto",
      items: [
        { net: 50, vat: 21 },
        { gross: 121, vat: 21 },
        { gross: 246, vat: 2.5 },
        { gross: 21, vat: 5 },
      ],
    });
    expect(mixed.data.vatRates).toEqual([
      { id: 5, baseAmount: 1.5, amount: 0.31 },
      { id: 9, baseAmount: 2.4, amount: 0.06 },
      { id: 8, baseAmount: 0.2, amount: 0.01 },
    ]);
    // 20.50 / 1.025 = 20.00; ties use the even minor unit.
    expect(
      calculateWsfeAmounts({
        issuer: "responsable_inscripto",
        items: [{ gross: 2050, vat: 2.5 }],
      }).data.netAmount
    ).toBe(20);
  });

  it("distinguishes zero-rated, exempt and untaxed amounts and omits zero bases", () => {
    expect(
      calculateWsfeAmounts({
        issuer: "responsable_inscripto",
        items: [
          { net: 100, vat: 0 },
          { gross: 200, vat: "exempt" },
          { net: 300, vat: "untaxed" },
          { gross: 0, vat: 21 },
        ],
      }).data
    ).toEqual({
      totalAmount: 6,
      netAmount: 1,
      vatAmount: 0,
      taxAmount: 0,
      exemptAmount: 2,
      nonTaxableAmount: 3,
      vatRates: [{ id: 3, baseAmount: 1, amount: 0 }],
    });
    expect(() =>
      calculateWsfeAmounts({
        issuer: "responsable_inscripto",
        items: [{ net: 1, vat: 0 }],
        total: 0,
      })
    ).toThrowError(
      expect.objectContaining({ code: "ARCA_INPUT_AMOUNT_MISMATCH" })
    );
  });

  it("requires exact totals for C, including generated amounts and zero", () => {
    for (let amount = 0; amount < 10_000; amount += 37) {
      for (const issuer of ["monotributo", "exento", "no_alcanzado"] as const) {
        const result = calculateWsfeAmounts({
          issuer,
          items: [{ amount }, { amount }],
          total: amount * 2,
        });
        expect(result.amounts.computedTotal).toBe(amount * 2);
        expect(result.data).not.toHaveProperty("vatRates");
        expect(() =>
          normalizeWsfeVoucherInput({
            ...base,
            ...result.data,
            voucherType: 11,
          })
        ).not.toThrow();
        expect(() =>
          calculateWsfeAmounts({
            issuer,
            items: [{ amount }],
            total: amount + 1,
          })
        ).toThrowError(
          expect.objectContaining({ code: "ARCA_INPUT_AMOUNT_MISMATCH" })
        );
      }
    }
  });

  it.each([
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    1_000_000_000_000_000,
  ])("rejects invalid minor units %s", (gross) => {
    expect(() =>
      calculateWsfeAmounts({
        issuer: "responsable_inscripto",
        items: [{ gross, vat: 21 }],
      })
    ).toThrowError(
      expect.objectContaining({
        code: "ARCA_INPUT_INVALID_AMOUNT",
        field: "items[0].gross",
      })
    );
  });

  it("rejects incompatible runtime item shapes and overflow", () => {
    for (const item of [
      { net: 100, gross: 100, vat: 21 },
      { amount: 100 },
      { net: 100, vat: 22 },
      { net: 100, vat: "21" },
      null,
    ]) {
      expect(() =>
        calculateWsfeAmounts({
          issuer: "responsable_inscripto",
          items: [item] as VatItem[],
        })
      ).toThrowError(
        expect.objectContaining({ code: "ARCA_INPUT_INVALID_VALUE" })
      );
    }
    for (const item of [
      { net: 100, vat: 21 },
      { amount: 100, vat: undefined },
    ]) {
      expect(() =>
        calculateWsfeAmounts({
          issuer: "monotributo",
          items: [item] as AmountItem[],
        })
      ).toThrowError(
        expect.objectContaining({
          code: "ARCA_INPUT_INVALID_VALUE",
          field: "items",
        })
      );
    }
    expect(() =>
      calculateWsfeAmounts({
        issuer: "monotributo",
        items: [{ amount: 999_999_999_999_999 }, { amount: 1 }],
      })
    ).toThrowError(
      expect.objectContaining({ code: "ARCA_INPUT_INVALID_AMOUNT" })
    );
  });
});
