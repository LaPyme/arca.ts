# Notas de crédito

ARCA no anula comprobantes. Una corrección es una nota de crédito, y los dos
modos de `issueCreditNote()` escriben un documento fiscal real que queda en los
registros de ARCA.

Una nota de crédito nombra la factura que corrige. El SDK no ofrece períodos
asociados; usá `wsfe.issue()` si lo necesitás.

## Nota parcial

Lo habitual es la nota parcial: una devolución o una corrección de precio que
acredita las líneas que elegís en vez de la factura entera.

Este bloque es [examples/nota-de-credito-parcial.ts](../examples/nota-de-credito-parcial.ts):

```ts
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
```

## Nota total

`all: true` acredita el original completo: espeja sus importes y sus alícuotas
de IVA línea por línea.

Este bloque es [examples/nota-de-credito-total.ts](../examples/nota-de-credito-total.ts):

```ts
import { createArcaClient, createFileStore } from "facturas";

// Configure ARCA credentials and a private durable directory before running.
// ARCA has no cancellation: this writes a real credit note for the whole
// invoice. Both the original and the note remain in ARCA's records.
const arca = createArcaClient({
  store: createFileStore("./private-arca-store"),
});
const nota = await arca.issueCreditNote(
  { for: { salesPoint: 3, voucherType: 11, number: 1 }, all: true },
  { idempotencyKey: "nota-de-credito-total-example-001" }
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
```

El modo es explícito y obligatorio: un input sin `items` ni `all: true`, o con
los dos, se rechaza antes de cualquier I/O, así un campo olvidado nunca puede
acreditar la factura entera.

## Qué sale del original y qué aportás vos

Del original el SDK toma la clase y por lo tanto el tipo de nota
(1 → 3, 6 → 8, 11 → 13), el tipo, el número y la condición de IVA del receptor,
la moneda y el tipo de cambio, el concepto y, para los conceptos 2 y 3, las
fechas de servicio, con el vencimiento elevado a la fecha de la nota. El
llamador aporta `for`, el modo (`items`, con un `total` opcional, o
`all: true`) y, como mucho, el `salesPoint` de la nota, que por defecto es el
del original, y `date`, que por defecto es hoy en Buenos Aires. No hay campos
`issuer`, `to` ni `currency`: una nota a otro receptor o en otra moneda es un
documento distinto y pertenece a la [capa exacta](./capa-exacta.md).

La forma de los ítems sigue la clase del original. Una nota de clase C acepta
ítems `{ amount }`; las notas de clase A y B aceptan ítems `{ gross | net, vat }`
con las mismas alícuotas y la misma conciliación que `issue()`. La clase es
evidencia del original, así que una forma que la contradice se rechaza después
de la única consulta del original y antes de cualquier escritura.

## Límites

La nota no puede superar el total del original. El SDK no lleva la cuenta de
notas anteriores contra un original; evitar que varias notas sumen más que la
factura es tarea de la aplicación.

Solo se pueden corregir facturas autorizadas de tipo 1, 6 u 11 en ARS o USD.
Los originales con tributos, campos opcionales, compradores, actividades o un
período asociado, los destinos que son notas de débito y las FCE requieren la
API exacta.

## Idempotencia y prueba en producción

`idempotencyKey` e `include` funcionan igual que en `issue()`; dale a la nota su
propia clave estable, por ejemplo `nc:${devolucion.id}`. Una repetición con
clave consulta solo la nota reservada e informa `amounts` a partir del request
guardado, así que en ese camino `computedTotal` es igual a `sentTotal` y
`vatAdjustment` es `0`.

Una prueba de humo en producción es una factura de ARS 1 seguida de una nota
total. **Los dos documentos son reales y quedan en los registros de ARCA.** La
nota es una operación aparte; si falla, la factura queda pendiente. Hacé
coincidir `issuer` con tu condición fiscal real.
