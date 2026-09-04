// Single-writer only: serialize per (representedTaxId, salesPoint, voucherType).
// The SDK does not coordinate writers. Servers/queues should persist attempts
// and use wsfe.authorizeVoucherOutcome(); concurrent writers collide on 10016.
import { createArcaClient } from "facturas";

const client = createArcaClient({
  taxId: "20123456789",
  certificatePem:
    "-----BEGIN CERTIFICATE-----\nREPLACE_WITH_YOUR_CERTIFICATE\n-----END CERTIFICATE-----",
  privateKeyPem:
    "-----BEGIN PRIVATE KEY-----\nREPLACE_WITH_YOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----",
  environment: "test",
});

const outcome = await client.vouchers.issue({
  issuer: "responsable_inscripto",
  salesPoint: 1,
  to: { condition: "consumidor_final" },
  items: [
    { gross: 12_100, vat: 21 }, // ARS 121.00, VAT included.
    { net: 10_000, vat: 10.5 }, // ARS 100.00 before VAT.
  ],
});

switch (outcome.kind) {
  case "authorized":
    console.log(outcome.voucher.cae, outcome.voucher.number);
    break;
  case "rejected":
    console.error(outcome.attempted, outcome.issues);
    break;
  case "indeterminate":
    // Preserve this number and evidence. Reconcile before another attempt.
    console.error(outcome.attempted, outcome.attempt, outcome.lookup);
    break;
  case "conflict":
    // Another voucher occupies the attempted number. Stop and investigate.
    console.error(outcome.attempted, outcome.found, outcome.reason);
    break;
  default:
    outcome satisfies never;
}
