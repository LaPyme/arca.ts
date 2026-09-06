import { createArcaClient, createMemoryStore, type IssueInput } from "facturas";

// Example only: use a durable store in an app. Memory does not survive restarts.
const arca = createArcaClient({ store: createMemoryStore() });
const venta = { id: "sale-example-002", totalEnCentavos: 121_000 };

const input: IssueInput = {
  issuer: "responsable_inscripto",
  salesPoint: 3,
  to: { condition: "consumidor_final" },
  items: [{ gross: 121_000, vat: 21 }], // ARS 1.210,00 en centavos
};

// preview() is synchronous and reaches no store, no WSAA and no SOAP.
const previsualizacion = arca.preview(input);
console.log(
  previsualizacion.voucherClass, // "B"
  previsualizacion.voucherType, // 6
  previsualizacion.amounts, // computedTotal, sentTotal, vatAdjustment
  previsualizacion.request // the exact WSFE input, without the voucher number
);

if (previsualizacion.amounts.sentTotal !== venta.totalEnCentavos) {
  throw new Error("The derived invoice does not match the sale total.");
}

const factura = await arca.issue(input, { idempotencyKey: venta.id });
if (factura.kind === "authorized") {
  // The issued amounts are the ones the preview showed.
  console.log(factura.voucher.amounts, previsualizacion.amounts);
}
