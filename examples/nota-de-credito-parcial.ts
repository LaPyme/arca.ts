import { createArcaClient, createFileStore } from "facturas";

// Configure ARCA credentials and a private durable directory before running.
// ARCA has no cancellation: this writes a real credit note for part of the
// original invoice. Both documents remain in ARCA's records.
const arca = createArcaClient({
  store: createFileStore("./private-arca-store"),
});
const devolucion = { id: "refund-example-001" };

const nota = await arca.issueCreditNote(
  {
    // The original invoice: a class C invoice of ARS 1.500,00 here.
    for: { salesPoint: 3, voucherType: 11, number: 41 },
    // Class C originals take amount items; A and B take { gross | net, vat }.
    items: [{ amount: 50_000 }], // ARS 500,00 en centavos
  },
  { idempotencyKey: `nc:${devolucion.id}` }
);

switch (nota.kind) {
  case "authorized":
    console.log(nota.voucher);
    break;
  case "rejected":
    console.error(nota.issues);
    break;
  case "indeterminate":
    console.error(nota.attempted, nota.lookup);
    break;
  case "conflict":
    console.error(nota.attempted, nota.found);
    break;
  default:
    nota satisfies never;
}
