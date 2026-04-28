import { createArcaClient } from "facturas";
import {
  ARCA_CONCEPT_TYPES,
  ARCA_CURRENCIES,
  ARCA_DOCUMENT_TYPES,
  ARCA_VAT_RATES,
  ARCA_VOUCHER_TYPES,
} from "facturas/constants";

const client = createArcaClient({
  taxId: "20123456789",
  certificatePem:
    "-----BEGIN CERTIFICATE-----\nREPLACE_WITH_YOUR_CERTIFICATE\n-----END CERTIFICATE-----",
  privateKeyPem:
    "-----BEGIN PRIVATE KEY-----\nREPLACE_WITH_YOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----",
  environment: "test",
});

async function main() {
  const issued = await client.wsfe.createNextVoucher({
    data: {
      salesPoint: 1,
      voucherType: ARCA_VOUCHER_TYPES.NOTA_CREDITO_B,
      concept: ARCA_CONCEPT_TYPES.PRODUCTOS,
      documentType: ARCA_DOCUMENT_TYPES.DNI,
      documentNumber: 30_123_456,
      voucherDate: "2026-05-02",
      totalAmount: 121,
      nonTaxableAmount: 0,
      netAmount: 100,
      exemptAmount: 0,
      taxAmount: 0,
      vatAmount: 21,
      currencyId: ARCA_CURRENCIES.PES,
      exchangeRate: 1,
      associatedVouchers: [
        {
          type: ARCA_VOUCHER_TYPES.FACTURA_B,
          salesPoint: 1,
          number: 245,
          voucherDate: "2026-04-30",
        },
      ],
      vatRates: [
        {
          id: ARCA_VAT_RATES.IVA_21,
          baseAmount: 100,
          amount: 21,
        },
      ],
    },
  });

  console.log(issued.cae, issued.caeExpiry, issued.voucherNumber);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
