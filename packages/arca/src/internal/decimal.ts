import { ArcaInputError } from "../errors";

const AMOUNT_SCALE = 100;
const EXCHANGE_RATE_SCALE = 1_000_000;
const EXCHANGE_RATE_SCALE_BIGINT = 1_000_000n;
const PERCENTAGE_SCALE = 100;

// WSFE documents amount fields as 13 integer digits plus 2 decimals.
const MAX_ARCA_AMOUNT_MINOR_UNITS = 999_999_999_999_999n;
// MonCotiz is documented as 4 integer digits plus 6 decimals.
const MAX_ARCA_EXCHANGE_RATE_SCALED = 9_999_999_999n;
// Tributo.Alic is documented as 3 integer digits plus 2 decimals.
const MAX_ARCA_PERCENTAGE_HUNDREDTHS = 99_999n;

export const SUPPORTED_VAT_RATES = [0, 2.5, 5, 10.5, 21, 27] as const;
export type SupportedVatRate = (typeof SUPPORTED_VAT_RATES)[number];

const VAT_RATE_BASIS_POINTS: Record<SupportedVatRate, bigint> = {
  0: 0n,
  2.5: 250n,
  5: 500n,
  10.5: 1050n,
  21: 2100n,
  27: 2700n,
};

export function normalizeArcaAmountToMinorUnits(
  value: number,
  field: string
): bigint {
  return normalizeScaledNumber({
    value,
    field,
    scale: AMOUNT_SCALE,
    maximum: MAX_ARCA_AMOUNT_MINOR_UNITS,
    expected: "a finite non-negative amount with at most 2 decimal places",
  });
}

export function serializeArcaAmount(value: number, field: string): string {
  return formatScaledInteger(normalizeArcaAmountToMinorUnits(value, field), 2);
}

export function serializeArcaMinorUnits(value: number, field: string): string {
  return formatScaledInteger(assertArcaMinorUnits(value, field), 2);
}

export function serializeArcaPercentage(value: number, field: string): string {
  const scaled = normalizeScaledNumber({
    value,
    field,
    scale: PERCENTAGE_SCALE,
    maximum: MAX_ARCA_PERCENTAGE_HUNDREDTHS,
    expected: "a finite non-negative percentage with at most 2 decimal places",
  });
  return formatScaledInteger(scaled, 2);
}

export function serializeArcaExchangeRate(
  value: number | string,
  field: string
): string {
  const scaled =
    typeof value === "number"
      ? normalizeExchangeRateNumber(value, field)
      : normalizeExchangeRateString(value, field);

  if (scaled <= 0n || scaled > MAX_ARCA_EXCHANGE_RATE_SCALED) {
    throwInvalidExchangeRate(field);
  }

  return formatScaledInteger(scaled, 6, true);
}

export function assertArcaMinorUnits(value: number, field: string): bigint {
  if (!(Number.isSafeInteger(value) && value >= 0)) {
    throw new ArcaInputError(
      `${field} must be a non-negative safe integer in currency minor units.`,
      {
        code: "ARCA_INPUT_INVALID_AMOUNT",
        field,
        expected: "a non-negative safe integer in currency minor units",
      }
    );
  }

  const minorUnits = BigInt(value);
  if (minorUnits > MAX_ARCA_AMOUNT_MINOR_UNITS) {
    throw new ArcaInputError(`${field} exceeds the WSFE amount limit.`, {
      code: "ARCA_INPUT_INVALID_AMOUNT",
      field,
      expected: "at most 13 integer digits and 2 decimal places",
    });
  }

  return minorUnits;
}

export function arcaMinorUnitsToNumber(
  minorUnits: bigint,
  field: string
): number {
  if (minorUnits < 0n || minorUnits > MAX_ARCA_AMOUNT_MINOR_UNITS) {
    throw new ArcaInputError(`${field} exceeds the WSFE amount limit.`, {
      code: "ARCA_INPUT_INVALID_AMOUNT",
      field,
      expected: "at most 13 integer digits and 2 decimal places",
    });
  }

  return Number(formatScaledInteger(minorUnits, 2));
}

export function calculateVatMinorUnits(
  taxableMinorUnits: bigint,
  vatRate: SupportedVatRate,
  field: string
): bigint {
  const basisPoints = VAT_RATE_BASIS_POINTS[vatRate];
  if (basisPoints === undefined) {
    throw new ArcaInputError(`${field} is not a supported VAT rate.`, {
      code: "ARCA_INPUT_INVALID_VALUE",
      field,
      expected: "one of 0, 2.5, 5, 10.5, 21, or 27",
    });
  }

  return roundHalfEvenRatio(taxableMinorUnits * basisPoints, 10_000n);
}

/**
 * Divides two non-negative integers and rounds the quotient to the nearest
 * integer, breaking exact ties toward the even neighbour.
 *
 * This is the rounding criterion the WSFE developer manual documents for the
 * service ("Round Half Even", section on validation tolerances), so VAT
 * derived here matches what ARCA computes for the same base and rate.
 */
export function roundHalfEvenRatio(
  numerator: bigint,
  denominator: bigint
): bigint {
  if (numerator < 0n || denominator <= 0n) {
    throw new RangeError(
      "roundHalfEvenRatio requires a non-negative numerator and a positive denominator."
    );
  }

  const quotient = numerator / denominator;
  const doubledRemainder = (numerator % denominator) * 2n;
  if (doubledRemainder > denominator) {
    return quotient + 1n;
  }
  if (doubledRemainder < denominator) {
    return quotient;
  }
  return quotient % 2n === 0n ? quotient : quotient + 1n;
}

export function isWithinArcaTolerance(
  actualMinorUnits: bigint,
  expectedMinorUnits: bigint,
  absoluteCentAllowance = 1
): boolean {
  const difference = absoluteBigInt(actualMinorUnits - expectedMinorUnits);
  if (difference <= BigInt(Math.max(1, absoluteCentAllowance))) {
    return true;
  }

  const comparisonBase = absoluteBigInt(expectedMinorUnits);
  return comparisonBase > 0n && difference * 10_000n <= comparisonBase;
}

function normalizeScaledNumber({
  value,
  field,
  scale,
  maximum,
  expected,
}: {
  value: number;
  field: string;
  scale: number;
  maximum: bigint;
  expected: string;
}): bigint {
  if (!(Number.isFinite(value) && value >= 0)) {
    throw new ArcaInputError(`${field} must be ${expected}.`, {
      code: "ARCA_INPUT_INVALID_AMOUNT",
      field,
      expected,
    });
  }

  const scaled = value * scale;
  const nearestInteger = Math.round(scaled);
  const representationTolerance = Math.max(
    1e-9,
    Math.abs(scaled) * Number.EPSILON * 4
  );

  if (Math.abs(scaled - nearestInteger) > representationTolerance) {
    throw new ArcaInputError(
      `${field} has more precision than its ARCA field allows.`,
      {
        code: "ARCA_INPUT_AMOUNT_PRECISION",
        field,
        expected,
      }
    );
  }

  if (!Number.isSafeInteger(nearestInteger)) {
    throw new ArcaInputError(`${field} exceeds the safely supported range.`, {
      code: "ARCA_INPUT_INVALID_AMOUNT",
      field,
      expected,
    });
  }

  const normalized = BigInt(nearestInteger);
  if (normalized > maximum) {
    throw new ArcaInputError(`${field} exceeds the ARCA field limit.`, {
      code: "ARCA_INPUT_INVALID_AMOUNT",
      field,
      expected,
    });
  }

  return normalized;
}

function normalizeExchangeRateNumber(value: number, field: string): bigint {
  if (!(Number.isFinite(value) && value > 0)) {
    throwInvalidExchangeRate(field);
  }

  const scaled = value * EXCHANGE_RATE_SCALE;
  const nearestInteger = Math.round(scaled);
  const representationTolerance = Math.max(
    1e-9,
    Math.abs(scaled) * Number.EPSILON * 4
  );

  if (
    Math.abs(scaled - nearestInteger) > representationTolerance ||
    !Number.isSafeInteger(nearestInteger)
  ) {
    throwInvalidExchangeRate(field);
  }

  return BigInt(nearestInteger);
}

function normalizeExchangeRateString(value: string, field: string): bigint {
  const match = value.match(/^(0|[1-9]\d{0,3})(?:\.(\d{1,6}))?$/);
  if (!match) {
    throwInvalidExchangeRate(field);
  }

  const [, integerPart, fractionPart = ""] = match;
  return (
    BigInt(integerPart) * EXCHANGE_RATE_SCALE_BIGINT +
    BigInt(fractionPart.padEnd(6, "0"))
  );
}

function throwInvalidExchangeRate(field: string): never {
  throw new ArcaInputError(
    `${field} must be a positive decimal with at most 4 integer and 6 fractional digits.`,
    {
      code: "ARCA_INPUT_INVALID_EXCHANGE_RATE",
      field,
      expected:
        "a positive decimal with up to 4 integer and 6 fractional digits",
    }
  );
}

function formatScaledInteger(
  value: bigint,
  fractionDigits: number,
  trimTrailingZeros = false
): string {
  const scale = 10n ** BigInt(fractionDigits);
  const integerPart = value / scale;
  const fractionPart = (value % scale).toString().padStart(fractionDigits, "0");

  if (trimTrailingZeros) {
    const trimmedFraction = fractionPart.replace(/0+$/, "");
    return trimmedFraction.length === 0
      ? integerPart.toString()
      : `${integerPart}.${trimmedFraction}`;
  }

  return `${integerPart}.${fractionPart}`;
}

function absoluteBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}
