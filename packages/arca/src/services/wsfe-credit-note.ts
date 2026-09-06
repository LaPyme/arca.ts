import type { VoucherClass } from "../constants";
import { ArcaInputError } from "../errors";
import { normalizeArcaAmountToMinorUnits } from "../internal/decimal";
import {
  normalizeWsfeDateInput,
  normalizeWsfeVoucherInput,
  type WsfeDateInput,
  type WsfeVoucherInfo,
  type WsfeVoucherInput,
} from "./wsfe";
import {
  calculateWsfeAmounts,
  type IssueAmounts,
  type VatItem,
} from "./wsfe-amounts";
import {
  assertIssueKeys,
  assertIssueObject,
  buenosAiresDate,
  type IssueInput,
} from "./wsfe-derive";
import type { VoucherCoordinates } from "./wsfe-identity";

/**
 * The credited lines and, at most, the note's own sales point and date.
 * Class, receiver, currency, concept and service dates come from the original.
 *
 * The mode is explicit: `items` credits the chosen lines, `all: true` credits
 * the whole original. A forgotten field never credits the whole invoice.
 */
export type CreditNoteInput = {
  /** The authorized invoice the note corrects. */
  for: VoucherCoordinates;
  salesPoint?: number;
  date?: WsfeDateInput;
} & (
  | { items: IssueInput["items"]; total?: number; all?: never }
  | { all: true; items?: never; total?: never }
);

type CreditNote = { voucherType: number; voucherClass: VoucherClass };
/** 10040: notes 3, 8 and 13 associate invoices 1, 6 and 11 respectively. */
const NOTES: Record<number, CreditNote> = {
  1: { voucherType: 3, voucherClass: "A" },
  6: { voucherType: 8, voucherClass: "B" },
  11: { voucherType: 13, voucherClass: "C" },
};
type CreditNoteHeader = Omit<
  WsfeVoucherInput,
  | "totalAmount"
  | "netAmount"
  | "vatAmount"
  | "nonTaxableAmount"
  | "exemptAmount"
  | "taxAmount"
  | "vatRates"
>;
type DerivedCreditNote = {
  data: WsfeVoucherInput;
  voucherClass: VoucherClass;
  amounts: IssueAmounts;
};

function invalid(reason: string): never {
  throw new ArcaInputError(
    `issueCreditNote cannot proceed: ${reason}. Use wsfe.issue() for exact control.`,
    { code: "ARCA_INPUT_INVALID_VALUE" }
  );
}
function required<T>(value: T | undefined, field: string): T {
  if (value === undefined || value === null) {
    invalid(`original is missing ${field}`);
  }
  return value;
}

/** Mirrors the original line by line, which items cannot reproduce cent-exact. */
export function deriveWsfeFullCreditNote(
  original: WsfeVoucherInfo,
  input: CreditNoteInput,
  now = new Date()
): DerivedCreditNote {
  const { note, header } = prepareCreditNote(original, input, now);
  const data: WsfeVoucherInput = {
    ...header,
    totalAmount: required(original.totalAmount, "totalAmount"),
    netAmount: required(original.netAmount, "netAmount"),
    vatAmount: required(original.vatAmount, "vatAmount"),
    exemptAmount: required(original.exemptAmount, "exemptAmount"),
    nonTaxableAmount: required(original.nonTaxableAmount, "nonTaxableAmount"),
    taxAmount: required(original.taxAmount, "taxAmount"),
    ...(original.vatRates === undefined
      ? {}
      : { vatRates: original.vatRates.map((rate) => ({ ...rate })) }),
  };
  normalizeWsfeVoucherInput(data);
  const total = Number(
    normalizeArcaAmountToMinorUnits(data.totalAmount, "totalAmount")
  );
  return {
    data,
    voucherClass: note.voucherClass,
    amounts: { computedTotal: total, sentTotal: total, vatAdjustment: 0 },
  };
}

/** Credits chosen lines through the same amount pipeline as issue(). */
export function deriveWsfePartialCreditNote(
  original: WsfeVoucherInfo,
  input: CreditNoteInput,
  now = new Date()
): DerivedCreditNote {
  if (input.items === undefined) {
    invalid("items is required to credit chosen lines");
  }
  const { note, header } = prepareCreditNote(original, input, now);
  // The class comes from the original, so the item shape must match it.
  const { data: amountsData, amounts } = calculateWsfeAmounts({
    voucherClass: note.voucherClass,
    items: input.items,
    total: input.total,
  });
  const originalTotal = normalizeArcaAmountToMinorUnits(
    required(original.totalAmount, "totalAmount"),
    "totalAmount"
  );
  if (BigInt(amounts.sentTotal) > originalTotal) {
    invalid(
      "the note total is greater than the original; the SDK does not track earlier notes against an original"
    );
  }
  const data: WsfeVoucherInput = { ...header, ...amountsData };
  normalizeWsfeVoucherInput(data);
  return { data, voucherClass: note.voucherClass, amounts };
}

/** Shared evidence: everything except the amounts comes from the original. */
function prepareCreditNote(
  original: WsfeVoucherInfo,
  input: CreditNoteInput,
  now: Date
): { note: CreditNote; header: CreditNoteHeader } {
  const note = NOTES[original.voucherType ?? 0];
  if (!note) {
    invalid("original must be an invoice of type 1, 6 or 11");
  }
  if (
    !(
      ["A", "O"].includes(original.result ?? "") &&
      original.cae?.trim() &&
      original.caeExpiry?.trim()
    )
  ) {
    invalid("original is not authorized");
  }
  rejectExtensions(original);
  if (original.currencyId !== "PES" && original.currencyId !== "DOL") {
    invalid("unsupported currency; only ARS and USD are supported");
  }
  const voucherDate = normalizeWsfeDateInput(
    input.date ?? buenosAiresDate(now),
    "date"
  ) as WsfeDateInput;
  const originalDate = normalizeWsfeDateInput(
    required(original.voucherDate, "voucherDate") as WsfeDateInput,
    "original.voucherDate"
  ) as WsfeDateInput;
  if (
    originalDate > voucherDate &&
    originalDate.slice(0, 6) !== voucherDate.slice(0, 6)
  ) {
    invalid(
      "original date is later than the note and outside its month (10210)"
    );
  }
  const header: CreditNoteHeader = {
    salesPoint: input.salesPoint ?? required(original.salesPoint, "salesPoint"),
    voucherType: note.voucherType,
    concept: required(original.concept, "concept"),
    documentType: required(original.documentType, "documentType"),
    documentNumber: Number(required(original.documentNumber, "documentNumber")),
    receiverVatConditionId: required(
      original.receiverVatConditionId,
      "receiverVatConditionId"
    ),
    currencyId: original.currencyId,
    exchangeRate: required(original.exchangeRate, "exchangeRate"),
    voucherDate,
    associatedVouchers: [
      {
        type: required(original.voucherType, "voucherType"),
        salesPoint: required(original.salesPoint, "salesPoint"),
        number: original.voucherNumber,
        voucherDate: originalDate,
      },
    ],
  };
  copyServiceDates(original, header);
  return { note, header };
}

function rejectExtensions(original: WsfeVoucherInfo) {
  for (const [field, rawField] of [
    ["taxes", "Tributos"],
    ["optionalFields", "Opcionales"],
    ["buyers", "Compradores"],
    ["activities", "Actividades"],
    ["associatedPeriod", "PeriodoAsoc"],
  ]) {
    const value = (original as unknown as Record<string, unknown>)[field];
    const raw = original.raw[rawField];
    if (present(value) || present(raw)) {
      invalid(`unsupported original ${field}`);
    }
  }
  if ((original.taxAmount ?? 0) !== 0) {
    invalid("unsupported original taxes");
  }
}
function present(value: unknown): boolean {
  return (
    value !== undefined &&
    value !== null &&
    value !== "" &&
    (!Array.isArray(value) || value.length > 0)
  );
}
function copyServiceDates(original: WsfeVoucherInfo, header: CreditNoteHeader) {
  if (header.concept !== 2 && header.concept !== 3) {
    return;
  }
  header.serviceStartDate = required(
    original.serviceStartDate,
    "serviceStartDate"
  ) as WsfeDateInput;
  header.serviceEndDate = required(
    original.serviceEndDate,
    "serviceEndDate"
  ) as WsfeDateInput;
  const due = normalizeWsfeDateInput(
    required(original.paymentDueDate, "paymentDueDate") as WsfeDateInput,
    "original.paymentDueDate"
  ) as WsfeDateInput;
  header.paymentDueDate = due < header.voucherDate ? header.voucherDate : due;
}

const CREDIT_NOTE_KEYS = ["for", "salesPoint", "date", "items", "total", "all"];
const TARGET_BOUNDS = [
  ["salesPoint", 99_999],
  ["voucherType", 999],
  ["number", 99_999_999],
] as const;

/** Zero I/O: rejects an ambiguous mode and copies the lines the caller owns. */
export function assertCreditNoteInput(input: CreditNoteInput): CreditNoteInput {
  assertIssueObject(input, "input");
  if ("associatedPeriod" in input) {
    throw new ArcaInputError(
      "issueCreditNote does not support associatedPeriod; a note against a period is exact-layer work. Use wsfe.issue() for exact control.",
      {
        code: "ARCA_INPUT_RESERVED_FIELD",
        field: "associatedPeriod",
        expected: "an associated invoice through for",
      }
    );
  }
  assertIssueKeys(input, CREDIT_NOTE_KEYS, "input", "issueCreditNote()");
  const target = assertCreditNoteTarget(input.for);
  if (input.salesPoint !== undefined) {
    assertCreditNoteBound(input.salesPoint, 99_999, "salesPoint");
  }
  const date =
    input.date === undefined
      ? undefined
      : (normalizeWsfeDateInput(input.date, "date") as WsfeDateInput);
  const common = {
    for: target,
    ...(input.salesPoint === undefined ? {} : { salesPoint: input.salesPoint }),
    ...(date === undefined ? {} : { date }),
  };
  if ((input.items === undefined) === (input.all === undefined)) {
    throw new ArcaInputError(
      "issueCreditNote needs exactly one mode: items for the credited lines, or all: true for the whole original.",
      {
        code: "ARCA_INPUT_INVALID_VALUE",
        field: input.items === undefined ? "input.items" : "input.all",
        expected: "either items or all: true, never both and never neither",
      }
    );
  }
  if (input.all !== undefined) {
    if (input.all !== true) {
      throw new ArcaInputError(
        "issueCreditNote accepts only all: true; pass items to credit chosen lines.",
        {
          code: "ARCA_INPUT_INVALID_VALUE",
          field: "input.all",
          expected: "the literal true",
        }
      );
    }
    if (input.total !== undefined) {
      throw new ArcaInputError(
        "issueCreditNote takes total only with items; all: true credits the original's own total.",
        {
          code: "ARCA_INPUT_INVALID_VALUE",
          field: "input.total",
          expected: "no total when all is true",
        }
      );
    }
    return { ...common, all: true };
  }
  return {
    ...common,
    items: copyCreditNoteItems(input.items),
    ...(input.total === undefined ? {} : { total: input.total }),
  };
}

function assertCreditNoteTarget(value: CreditNoteInput["for"]) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ArcaInputError(
      "issueCreditNote requires for: the coordinates of the authorized invoice the note corrects.",
      {
        code: "ARCA_INPUT_MISSING_FIELD",
        field: "input.for",
        expected: "{ salesPoint, voucherType, number }",
      }
    );
  }
  assertIssueKeys(
    value,
    ["salesPoint", "voucherType", "number"],
    "input.for",
    "issueCreditNote()"
  );
  for (const [field, max] of TARGET_BOUNDS) {
    assertCreditNoteBound(value[field], max, `for.${field}`);
  }
  if (![1, 6, 11].includes(value.voucherType)) {
    throw new ArcaInputError(
      "issueCreditNote requires an authorized invoice of type 1, 6 or 11 in for.voucherType. Use wsfe.issue() for exact control.",
      {
        code: "ARCA_INPUT_INVALID_VALUE",
        field: "input.for.voucherType",
        expected: "1, 6 or 11",
      }
    );
  }
  return {
    salesPoint: value.salesPoint,
    voucherType: value.voucherType,
    number: value.number,
  };
}

function assertCreditNoteBound(value: number, max: number, path: string) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new ArcaInputError(
      `issueCreditNote requires input.${path} to be an integer from 1 through ${max}.`,
      { code: "ARCA_INPUT_INVALID_VALUE", field: `input.${path}` }
    );
  }
}

// The caller keeps the array it passed; a later mutation must not reach ARCA.
function copyCreditNoteItems<T extends readonly VatItem[] | readonly object[]>(
  items: T
): T {
  if (!Array.isArray(items)) {
    throw new ArcaInputError(
      "issueCreditNote requires items to be a non-empty array of items.",
      {
        code: "ARCA_INPUT_INVALID_VALUE",
        field: "input.items",
        expected: "a non-empty array of items",
      }
    );
  }
  return items.map((item) =>
    item === null || typeof item !== "object" ? item : { ...item }
  ) as unknown as T;
}
