/** Common ARCA reference data for readable userland code and examples. */
export const ARCA_VOUCHER_TYPES = {
  FACTURA_A: 1,
  NOTA_DEBITO_A: 2,
  NOTA_CREDITO_A: 3,
  FACTURA_B: 6,
  NOTA_DEBITO_B: 7,
  NOTA_CREDITO_B: 8,
} as const;

/** Common document types accepted by ARCA services. */
export const ARCA_DOCUMENT_TYPES = {
  CUIT: 80,
  DNI: 96,
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
} as const;

/** Common ARCA currency identifiers. */
export const ARCA_CURRENCIES = {
  PES: "PES",
  DOL: "DOL",
} as const;
