# facturas (English summary)

Node.js SDK for ARCA / AFIP: invoices, credit notes and Padrón, with direct
WSFE and WSMTXCA integration. ESM-only, Node.js >= 20.

**The full documentation is in Spanish**, in [docs/](../README.md). This page
is a summary, not a translation.

## Install

```bash
pnpm add facturas
```

## Issue an invoice

Set `ARCA_TAX_ID`, `ARCA_CERTIFICATE_PEM`, `ARCA_PRIVATE_KEY_PEM` and
`ARCA_ENVIRONMENT`, provision the store table, and pass the sale's stable ID as
the idempotency key. Amounts are integer minor units.

```ts
import { createArcaClient, createPostgresStore } from "facturas";
import { sql } from "@vercel/postgres";

const arca = createArcaClient({
  store: createPostgresStore({ query: (text, params) => sql.query(text, params) }),
});

const factura = await arca.issue(
  {
    issuer: "monotributo",
    salesPoint: 3,
    to: { condition: "consumidor_final" },
    items: [{ amount: 150_000 }], // ARS 1.500,00 in minor units
  },
  { idempotencyKey: venta.id },
);
```

## Issue a credit note

ARCA has no cancellation. A correction is a credit note, and it is a real
fiscal document. The partial mode credits the chosen lines; `all: true` credits
the whole original.

```ts
const nota = await arca.issueCreditNote(
  {
    for: { salesPoint: 3, voucherType: 11, number: 41 },
    items: [{ amount: 50_000 }], // ARS 500,00 of an ARS 1.500,00 invoice
  },
  { idempotencyKey: `nc:${devolucion.id}` },
);
```

## Outcomes

| Outcome | Meaning and caller action |
| --- | --- |
| `authorized` | Save the voucher and CAE. `recoveredByMatch: true` means the stored input matched the consulted identity; it proves consistency, not authorship. |
| `rejected` | Review ARCA's `issues`. A key remains bound to its input even after rejection. |
| `indeterminate` | Preserve the number and evidence. Reconcile or retry the identical input with its existing key. |
| `conflict` | A different voucher occupies the reserved number. Stop and investigate. |

## Where to read more

| Page | Topic |
| --- | --- |
| [inicio-rapido.md](../inicio-rapido.md) | Quick start |
| [facturas.md](../facturas.md) | `issue()`, `preview()`, invoice inputs, facade contract |
| [notas-de-credito.md](../notas-de-credito.md) | `issueCreditNote()` |
| [stores.md](../stores.md) | Postgres, Redis, files, memory, custom store |
| [configuracion.md](../configuracion.md) | Environment variables and client options |
| [capa-exacta.md](../capa-exacta.md) | Exact WSFE / WSMTXCA layer and service surface |
| [errores.md](../errores.md) | Error classes and troubleshooting |
| [referencia.md](../referencia.md) | Constants, public API, security |
| [ejemplos.md](../ejemplos.md) | Index of [examples/](../../examples) |

[CONTRIBUTING.md](../../CONTRIBUTING.md) is in English.
