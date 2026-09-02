/** Common ARCA reference data for readable userland code and examples. */
export const ARCA_VOUCHER_TYPES = {
  FACTURA_A: 1,
  NOTA_DEBITO_A: 2,
  NOTA_CREDITO_A: 3,
  FACTURA_B: 6,
  NOTA_DEBITO_B: 7,
  NOTA_CREDITO_B: 8,
  FACTURA_C: 11,
  NOTA_DEBITO_C: 12,
  NOTA_CREDITO_C: 13,
} as const;

/** Common document types accepted by ARCA services. */
export const ARCA_DOCUMENT_TYPES = {
  CUIT: 80,
  DNI: 96,
  CONSUMIDOR_FINAL: 99,
} as const;

/**
 * Common receiver IVA condition identifiers used by WSFE.
 * Allowed values depend on the voucher class and ARCA's live catalog.
 */
export const ARCA_RECEIVER_VAT_CONDITIONS = {
  RESPONSABLE_INSCRIPTO: 1,
  EXENTO: 4,
  CONSUMIDOR_FINAL: 5,
  MONOTRIBUTISTA: 6,
  IVA_NO_ALCANZADO: 15,
} as const;

/** Supported invoice concept types for WSFE requests. */
export const ARCA_CONCEPT_TYPES = {
  PRODUCTOS: 1,
  SERVICIOS: 2,
  PRODUCTOS_Y_SERVICIOS: 3,
} as const;

/** Common IVA rate identifiers used by WSFE. */
export const ARCA_VAT_RATES = {
  IVA_0: 3,
  IVA_10_5: 4,
  IVA_21: 5,
  IVA_27: 6,
  IVA_5: 8,
  IVA_2_5: 9,
} as const;

/** ISO currency codes accepted by the high-level WSFE builders. */
export const ISO_CURRENCIES = {
  ARS: "ARS",
  USD: "USD",
} as const;

/** ARCA currency identifiers keyed by their corresponding ISO currency. */
export const ARCA_CURRENCY_IDS = {
  ARS: "PES",
  USD: "DOL",
} as const;

/**
 * Common ARCA currency identifiers.
 * @deprecated Use ISO_CURRENCIES for builders or ARCA_CURRENCY_IDS at the exact provider boundary.
 */
export const ARCA_CURRENCIES = {
  PES: "PES",
  DOL: "DOL",
} as const;
