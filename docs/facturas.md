# Facturas

`issue()` es la fachada: derivá el comprobante desde datos de negocio, reservá
el número y recuperá los reintentos. Para los campos que no deriva, usá la
[capa exacta](./capa-exacta.md).

## Emitir con clave de idempotencia

Definí las [variables de entorno](./configuracion.md#variables-de-entorno),
creá la tabla del [store](./stores.md#postgres) y usá el ID estable de la venta
como clave. El ejemplo asume que `venta` es tu venta.

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
    items: [{ amount: 150_000 }], // ARS 1.500,00 en centavos
  },
  { idempotencyKey: venta.id },
);
```

Sin `idempotencyKey`, un reintento después de una caída puede emitir la factura
dos veces. Configurá un `store` y pasá la clave para que los reintentos sean
seguros.

Una clave tiene de 1 a 255 caracteres. Usá el ID de la venta o del pedido,
nunca un UUID nuevo por intento. No pongas CUIT, DNI ni otros datos personales
en las claves. Reusá la misma clave y el mismo input en los reintentos; si el
input cambia, se lanza `ARCA_INPUT_IDEMPOTENCY_MISMATCH`. Las claves están
alcanzadas al CUIT del cliente y al entorno. `representedTaxId` también se
controla como parte de la identidad del input. Una clave sin store lanza antes
de cualquier I/O con el proveedor. Claves distintas identifican operaciones de
negocio distintas; una clave no reserva toda la secuencia del punto de venta
frente a otros escritores.

El ejemplo completo, con el tratamiento de los cuatro resultados, está en
[examples/issue-invoice.ts](../examples/issue-invoice.ts).

## Revisá antes de emitir

`preview()` deriva exactamente lo que enviaría `issue()`, sin ninguna I/O: sin
store, sin WSAA, sin SOAP y sin lectura del próximo número. Lanza los mismos
errores de input que lanza `issue()` antes de su primera llamada, así que un
input que previsualiza limpio no genera ningún error local nuevo al emitir.

Este bloque es [examples/preview.ts](../examples/preview.ts):

```ts
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
```

`preview()` es sincrónico y devuelve la `voucherClass` derivada, el
`voucherType`, los mismos `amounts` que informa un resultado autorizado, y
`request`, el `WsfeVoucherInput` exacto que enviaría `issue()`. El número de
comprobante no aparece porque recién se conoce cuando se reserva el número al
emitir. Previsualizar una nota de crédito necesita el original y no se ofrece.

## Datos de la factura

El emisor es tu afirmación legal en cada llamada; el SDK nunca lo infiere de
los ítems ni del Padrón. Un emisor RI produce A para receptores RI o
Monotributo y B para las demás condiciones soportadas. Los emisores
Monotributo, Exento y No Alcanzado producen C y usan
`items: [{ amount: 10_000 }]`. ARCA valida la habilitación real. `to` es el
receptor fiscal (los campos de documento y de condición del receptor de la capa
exacta), no un registro de cliente.

Los importes son enteros en centavos. Para ítems de RI, elegí `net` o `gross`
en cada ítem y uno de `0 | 2.5 | 5 | 10.5 | 21 | 27 | "exempt" | "untaxed"`
para `vat`. El cero numérico es una alícuota de IVA; los importes exentos y no
gravados tienen campos fiscales propios. Los ítems se agrupan por alícuota
antes del redondeo Round Half Even.

`total`, cuando lo pasás, afirma el total enviado. El SDK ajusta el IVA de
cabecera solo dentro de un centavo por cada alícuota numérica emitida, y
mantiene el IVA no negativo. Los totales de clase C tienen que coincidir
exactamente. Los resultados autorizados exponen `computedTotal`, `sentTotal` y
`vatAdjustment` en `voucher.amounts`, todos en centavos.

Los valores por defecto son la fecha de hoy en Buenos Aires, productos
(concepto 1) y `ARS` con tipo de cambio `1`. Usá `currency: "USD"` con un
`exchangeRate` decimal positivo en string, o `service: { from, to, dueDate }`
para el concepto 2. Las fechas aceptan `YYYY-MM-DD` o `YYYYMMDD`; el fin del
servicio tiene que ser igual o posterior a su inicio y el vencimiento de pago
igual o posterior a la fecha de la factura.

Los receptores que no son consumidor final requieren un `cuit` de 11 dígitos.
Un consumidor final acepta un `cuit` o un `dni`, o ninguno por debajo del
umbral de identificación. Desde ARS 10.000.000 (incluidos los USD convertidos
al tipo de cambio informado), la identificación es obligatoria según la
[RG 5866/2026](https://www.argentina.gob.ar/normativa/nacional/norma-427092/texto).
Cuando el cliente pide el CUIT para deducir en Ganancias, informalo sin importar
el monto. Los controles de forma del documento no verifican la inscripción ante
el proveedor.

## Contrato fiscal de la fachada

Sin clave, una llamada lee un próximo número y autoriza una vez, con a lo sumo
una consulta de identidad después de una respuesta indeterminada. Es el
comportamiento de la v0.8. Una primera llamada con clave reserva ese número
antes de escribir. Una repetición con clave consulta la reserva: solo
`not_found` habilita una autorización del número guardado. Un comprobante
encontrado nunca se reenvía. Las escrituras indeterminadas y los rechazos 10016
con clave pueden agregar una consulta; un 10016 sin coincidencia completa sigue
siendo rechazo. `issueCreditNote()` agrega la consulta del original solo cuando
crea una reserva nueva.

| Resultado | Significado y acción del llamador |
| --- | --- |
| `authorized` | Guardá el comprobante y el CAE. `recoveredByMatch: true` significa que el input guardado coincidió con la identidad consultada; prueba consistencia, no autoría. |
| `rejected` | Revisá los `issues` de ARCA. Una clave queda ligada a su input incluso después de un rechazo. |
| `indeterminate` | Conservá el número y la evidencia. Conciliá o repetí el input idéntico con su clave existente. |
| `conflict` | Hay otro comprobante en el número reservado. Detené el flujo e investigá. |

El segundo argumento acepta `idempotencyKey`, `representedTaxId`,
`forceRefresh` e `include: { raw: true, exactInput: true }`. Los resultados no
traen la evidencia cruda por defecto; `sent` se incluye solo en resultados
autorizados y solo si lo pedís. Una repetición sin un resultado de escritura
observado usa un intento indeterminado con `reason: "incomplete_response"`; la
consulta aporta la evidencia de autorización.

El comparador de identidad compara coordenadas, fecha, concepto, receptor,
moneda, todos los importes de cabecera, alícuotas de IVA, fechas de servicio y
asociaciones de notas. Los campos faltantes quedan incompletos; las diferencias
son conflictos. Las extensiones exactas no soportadas quedan incompletas. Usá
las APIs exactas para tributos, FCE, otras condiciones de receptor, anulación
en moneda extranjera con la misma moneda y WSMTXCA.
