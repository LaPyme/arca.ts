import { describe, expect, it } from "vitest";
import {
  normalizeWsfeVoucherInput,
  type WsfeDateInput,
  type WsfeVoucherInfo,
} from "./wsfe";
import type { AmountItem, VatItem } from "./wsfe-amounts";
import {
  type CreditNoteInput,
  deriveWsfeFullCreditNote,
  deriveWsfePartialCreditNote,
} from "./wsfe-credit-note";
import { deriveWsfeInvoice, type IssueInput } from "./wsfe-derive";

function original(input: IssueInput): WsfeVoucherInfo {
  const data = deriveWsfeInvoice(input).data;
  return {
    ...data,
    documentNumber: String(data.documentNumber),
    exchangeRate: Number(data.exchangeRate),
    voucherNumber: 1,
    result: "A",
    cae: "123",
    caeExpiry: "20260914",
    raw: {},
  };
}
const invoice = original({
  issuer: "responsable_inscripto",
  salesPoint: 1,
  date: "20260904",
  to: { condition: "consumidor_final" },
  items: [
    { net: 10_000, vat: 21 },
    { net: 10_000, vat: 10.5 },
    { net: 200, vat: "exempt" },
    { net: 300, vat: "untaxed" },
  ],
});
const classA = original({
  issuer: "responsable_inscripto",
  salesPoint: 1,
  date: "20260904",
  to: { condition: "responsable_inscripto", cuit: "20123456789" },
  items: [{ net: 10_000, vat: 21 }],
});
const classC = original({
  issuer: "monotributo",
  salesPoint: 1,
  date: "20260904",
  to: { condition: "consumidor_final" },
  items: [{ amount: 100 }],
});
const target = { salesPoint: 1, voucherType: 11, number: 1 };
function full(date?: WsfeDateInput): CreditNoteInput {
  return { for: target, all: true, ...(date === undefined ? {} : { date }) };
}
function partial(
  items: readonly VatItem[] | readonly AmountItem[],
  extra: { total?: number; salesPoint?: number; date?: WsfeDateInput } = {}
): CreditNoteInput {
  return { for: target, items, date: "20260905", ...extra };
}

describe("full credit note derivation", () => {
  it.each([
    [1, 3, "A"],
    [6, 8, "B"],
    [11, 13, "C"],
  ] as const)("maps %s to %s", (voucherType, type, voucherClass) => {
    const data = voucherType === 11 ? classC : { ...invoice, voucherType };
    const result = deriveWsfeFullCreditNote(data, full("20260905"));
    expect(result.voucherClass).toBe(voucherClass);
    expect(result.data.voucherType).toBe(type);
    expect(result.data.associatedVouchers).toEqual([
      { type: voucherType, salesPoint: 1, number: 1, voucherDate: "20260904" },
    ]);
    normalizeWsfeVoucherInput(result.data);
  });
  it("copies all monetary fields and VAT details without rounding", () => {
    const { data } = deriveWsfeFullCreditNote(invoice, full("20260905"));
    for (const field of [
      "totalAmount",
      "netAmount",
      "vatAmount",
      "nonTaxableAmount",
      "exemptAmount",
      "taxAmount",
      "vatRates",
      "currencyId",
      "exchangeRate",
      "documentType",
      "receiverVatConditionId",
    ] as const) {
      expect(data[field]).toEqual(invoice[field]);
    }
    expect(data.vatRates).not.toBe(invoice.vatRates);
  });
  it.each([
    2, 3,
  ])("preserves service dates and raises due date for concept %s", (concept) => {
    const service = {
      ...invoice,
      concept,
      serviceStartDate: "20260901",
      serviceEndDate: "20260904",
      paymentDueDate: "20260904",
    };
    const { data } = deriveWsfeFullCreditNote(service, full("20260905"));
    expect(data).toMatchObject({
      concept,
      serviceStartDate: "20260901",
      serviceEndDate: "20260904",
      paymentDueDate: "20260905",
    });
    expect(
      deriveWsfeFullCreditNote(
        { ...service, paymentDueDate: "20260930" },
        full("20260905")
      ).data.paymentDueDate
    ).toBe("20260930");
  });
  it.each([
    ["taxes", "Tributos"],
    ["optionalFields", "Opcionales"],
    ["buyers", "Compradores"],
    ["activities", "Actividades"],
    ["associatedPeriod", "PeriodoAsoc"],
  ])("rejects unsupported %s", (field, rawField) => {
    expect(() =>
      deriveWsfeFullCreditNote(
        { ...invoice, raw: { [rawField]: { value: 1 } } },
        full("20260905")
      )
    ).toThrow(field);
    expect(() =>
      deriveWsfeFullCreditNote(
        { ...invoice, [field]: [{ value: 1 }] },
        full("20260905")
      )
    ).toThrow("wsfe.issue()");
    expect(() =>
      deriveWsfePartialCreditNote(
        { ...invoice, [field]: [{ value: 1 }] },
        partial([{ gross: 100, vat: 21 }])
      )
    ).toThrow("wsfe.issue()");
  });
  it("rejects missing required evidence and unsupported originals", () => {
    for (const change of [
      { result: "R" },
      { voucherType: 8 },
      { currencyId: "060" },
      { cae: undefined },
      { receiverVatConditionId: undefined },
      { taxAmount: 1 },
    ]) {
      expect(() =>
        deriveWsfeFullCreditNote({ ...invoice, ...change }, full("20260905"))
      ).toThrow();
    }
    expect(() =>
      deriveWsfeFullCreditNote({ ...invoice, concept: 2 }, full("20260905"))
    ).toThrow("serviceStartDate");
  });
  it("uses Buenos Aires date and respects association date rules", () => {
    expect(
      deriveWsfeFullCreditNote(
        invoice,
        full(),
        new Date("2026-09-06T01:00:00Z")
      ).data.voucherDate
    ).toBe("20260905");
    expect(() => deriveWsfeFullCreditNote(invoice, full("20260831"))).toThrow(
      "10210"
    );
    expect(
      deriveWsfeFullCreditNote(invoice, full("20260903")).data.voucherDate
    ).toBe("20260903");
  });
  it("names issueCreditNote and never cancel in its errors", () => {
    expect(() =>
      deriveWsfeFullCreditNote({ ...invoice, voucherType: 8 }, full("20260905"))
    ).toThrowError(
      expect.objectContaining({
        code: "ARCA_INPUT_INVALID_VALUE",
        message: expect.stringContaining("issueCreditNote"),
      })
    );
    expect(() =>
      deriveWsfeFullCreditNote({ ...invoice, voucherType: 8 }, full("20260905"))
    ).not.toThrow(/cancel/);
  });
});

describe("partial credit note derivation", () => {
  it("credits chosen amount items against a class C original", () => {
    const result = deriveWsfePartialCreditNote(
      classC,
      partial([{ amount: 40 }])
    );
    expect(result.voucherClass).toBe("C");
    expect(result.data).toMatchObject({
      voucherType: 13,
      salesPoint: 1,
      concept: 1,
      documentType: 99,
      documentNumber: 0,
      receiverVatConditionId: 5,
      currencyId: "PES",
      exchangeRate: 1,
      voucherDate: "20260905",
      totalAmount: 0.4,
      netAmount: 0.4,
      vatAmount: 0,
      associatedVouchers: [
        { type: 11, salesPoint: 1, number: 1, voucherDate: "20260904" },
      ],
    });
    expect(result.data).not.toHaveProperty("vatRates");
    expect(result.amounts).toEqual({
      computedTotal: 40,
      sentTotal: 40,
      vatAdjustment: 0,
    });
    normalizeWsfeVoucherInput(result.data);
  });
  it.each([
    ["A", classA, 3],
    ["B", invoice, 8],
  ] as const)("credits VAT items against a class %s original", (voucherClass, source, voucherType) => {
    const items: VatItem[] = [
      { gross: 6050, vat: 21 },
      { net: 1000, vat: 10.5 },
      { gross: 500, vat: "exempt" },
    ];
    const result = deriveWsfePartialCreditNote(source, partial(items));
    expect(result.voucherClass).toBe(voucherClass);
    expect(result.data.voucherType).toBe(voucherType);
    expect(result.amounts).toEqual({
      computedTotal: 7655,
      sentTotal: 7655,
      vatAdjustment: 0,
    });
    // The amount pipeline is the invoice's: same items, same numbers.
    expect(result.data.vatRates).toEqual(
      deriveWsfeInvoice({
        issuer: "responsable_inscripto",
        salesPoint: 1,
        date: "20260905",
        to: { condition: "consumidor_final" },
        items,
      }).data.vatRates
    );
    expect(result.data).toMatchObject({
      totalAmount: 76.55,
      exemptAmount: 5,
      documentType: source.documentType,
      documentNumber: Number(source.documentNumber),
      receiverVatConditionId: source.receiverVatConditionId,
    });
    normalizeWsfeVoucherInput(result.data);
  });
  it("derives amounts exactly as issue() does, including the total tolerance", () => {
    const items: VatItem[] = [
      { net: 3333, vat: 21 },
      { net: 3333, vat: 10.5 },
    ];
    const asInvoice = deriveWsfeInvoice({
      issuer: "responsable_inscripto",
      salesPoint: 1,
      date: "20260905",
      to: { condition: "consumidor_final" },
      items,
      total: 7717,
    });
    const asNote = deriveWsfePartialCreditNote(
      invoice,
      partial(items, { total: 7717 })
    );
    expect(asNote.amounts).toEqual(asInvoice.amounts);
    for (const field of [
      "totalAmount",
      "netAmount",
      "vatAmount",
      "exemptAmount",
      "nonTaxableAmount",
      "taxAmount",
      "vatRates",
    ] as const) {
      expect(asNote.data[field]).toEqual(asInvoice.data[field]);
    }
    expect(() =>
      deriveWsfePartialCreditNote(invoice, partial(items, { total: 7720 }))
    ).toThrowError(
      expect.objectContaining({ code: "ARCA_INPUT_AMOUNT_MISMATCH" })
    );
  });
  it("rejects an item shape that does not match the original's class", () => {
    expect(() =>
      deriveWsfePartialCreditNote(classC, partial([{ gross: 100, vat: 21 }]))
    ).toThrowError(
      expect.objectContaining({
        code: "ARCA_INPUT_INVALID_VALUE",
        field: "items",
        message: expect.stringContaining("class C"),
      })
    );
    for (const source of [classA, invoice]) {
      expect(() =>
        deriveWsfePartialCreditNote(source, partial([{ amount: 100 }]))
      ).toThrowError(
        expect.objectContaining({
          code: "ARCA_INPUT_INVALID_VALUE",
          field: "items",
          message: expect.stringContaining("class A or B"),
        })
      );
    }
  });
  it("refuses a note greater than the original and allows the exact total", () => {
    expect(() =>
      deriveWsfePartialCreditNote(classC, partial([{ amount: 101 }]))
    ).toThrowError(
      expect.objectContaining({
        code: "ARCA_INPUT_INVALID_VALUE",
        message: expect.stringContaining("greater than the original"),
      })
    );
    expect(
      deriveWsfePartialCreditNote(classC, partial([{ amount: 100 }])).amounts
        .sentTotal
    ).toBe(100);
    expect(() =>
      deriveWsfePartialCreditNote(
        invoice,
        partial([{ gross: 30_000, vat: 21 }])
      )
    ).toThrow("greater than the original");
  });
  it("keeps the original's service dates, currency and rate", () => {
    const services = {
      ...invoice,
      concept: 2,
      serviceStartDate: "20260901",
      serviceEndDate: "20260904",
      paymentDueDate: "20260901",
      currencyId: "DOL",
      exchangeRate: 1200.5,
    };
    const { data } = deriveWsfePartialCreditNote(
      services,
      partial([{ gross: 12_100, vat: 21 }])
    );
    expect(data).toMatchObject({
      concept: 2,
      serviceStartDate: "20260901",
      serviceEndDate: "20260904",
      paymentDueDate: "20260905",
      currencyId: "DOL",
      exchangeRate: 1200.5,
    });
    normalizeWsfeVoucherInput(data);
  });
  it("issues the note from its own sales point when asked", () => {
    expect(
      deriveWsfePartialCreditNote(
        classC,
        partial([{ amount: 40 }], { salesPoint: 7 })
      ).data
    ).toMatchObject({
      salesPoint: 7,
      associatedVouchers: [
        { type: 11, salesPoint: 1, number: 1, voucherDate: "20260904" },
      ],
    });
  });
  it("requires items", () => {
    expect(() =>
      deriveWsfePartialCreditNote(classC, { for: target, all: true })
    ).toThrowError(
      expect.objectContaining({ code: "ARCA_INPUT_INVALID_VALUE" })
    );
  });
});
