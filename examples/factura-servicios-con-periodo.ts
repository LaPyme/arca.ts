import { createArcaClient } from "@lapyme/arca";
import {
  ARCA_CONCEPT_TYPES,
  ARCA_CURRENCIES,
  ARCA_DOCUMENT_TYPES,
  ARCA_VAT_RATES,
  ARCA_VOUCHER_TYPES,
} from "@lapyme/arca/constants";

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
      salesPoint: 2,
      voucherType: ARCA_VOUCHER_TYPES.FACTURA_A,
      concept: ARCA_CONCEPT_TYPES.SERVICIOS,
      documentType: ARCA_DOCUMENT_TYPES.CUIT,
      documentNumber: 30_717_329_654,
      voucherDate: "2026-05-10",
      totalAmount: 2420,
      nonTaxableAmount: 0,
      netAmount: 2000,
      exemptAmount: 0,
      taxAmount: 0,
      vatAmount: 420,
      currencyId: ARCA_CURRENCIES.PES,
      exchangeRate: 1,
      serviceStartDate: "2026-05-01",
      serviceEndDate: "2026-05-31",
      paymentDueDate: "2026-06-10",
      vatRates: [
        {
          id: ARCA_VAT_RATES.IVA_21,
          baseAmount: 2000,
          amount: 420,
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
