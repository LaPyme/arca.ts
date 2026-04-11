import { describe, expect, it } from "vitest";
import {
  ARCA_CONCEPT_TYPES,
  ARCA_CURRENCIES,
  ARCA_DOCUMENT_TYPES,
  ARCA_VAT_RATES,
  ARCA_VOUCHER_TYPES,
} from "./constants";

describe("constants", () => {
  it("exports representative WSFE reference values", () => {
    expect(ARCA_VOUCHER_TYPES).toMatchObject({
      FACTURA_A: 1,
      FACTURA_B: 6,
      NOTA_CREDITO_A: 3,
      NOTA_CREDITO_B: 8,
    });
    expect(ARCA_DOCUMENT_TYPES).toMatchObject({
      CUIT: 80,
      DNI: 96,
    });
    expect(ARCA_CONCEPT_TYPES).toMatchObject({
      PRODUCTOS: 1,
      SERVICIOS: 2,
      PRODUCTOS_Y_SERVICIOS: 3,
    });
    expect(ARCA_VAT_RATES).toMatchObject({
      IVA_0: 3,
      IVA_10_5: 4,
      IVA_21: 5,
      IVA_27: 6,
    });
    expect(ARCA_CURRENCIES).toEqual({
      PES: "PES",
      DOL: "DOL",
    });
  });
});
