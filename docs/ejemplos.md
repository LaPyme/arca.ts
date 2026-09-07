# Ejemplos

Los ejemplos viven en [examples/](../examples) y son deliberadamente completos,
con valores fijos y legibles, para que un desarrollador o un agente de código
los adapte rápido. Los ejemplos de emisión usan fechas determinísticas para que
compilen; reemplazalas por una fecha actual permitida por ARCA antes de una
prueba en homologación.

## Fachada

- [Primera factura, sin store ni clave](../examples/primera-factura.ts)
- [Factura con clave de idempotencia](../examples/issue-invoice.ts)
- [Previsualizar antes de emitir](../examples/preview.ts)
- [Nota de crédito parcial](../examples/nota-de-credito-parcial.ts)
- [Nota de crédito total](../examples/nota-de-credito-total.ts)
- [Emisión completa: tributos, FCE, WSMTXCA y notas](../examples/emision-completa.ts)

## Capa exacta

- [factura-b-consumidor-final.ts](../examples/factura-b-consumidor-final.ts)
- [factura-a-responsable-inscripto.ts](../examples/factura-a-responsable-inscripto.ts)
- [nota-de-credito-asociada.ts](../examples/nota-de-credito-asociada.ts)
- [factura-servicios-con-periodo.ts](../examples/factura-servicios-con-periodo.ts)

## Consultas

- [consultar-comprobante.ts](../examples/consultar-comprobante.ts)
- [consultar-contribuyente.ts](../examples/consultar-contribuyente.ts)
