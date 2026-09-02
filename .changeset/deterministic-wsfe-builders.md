---
"facturas": minor
---

Add deterministic WSFE money handling and high-level Factura B/C builders. Receiver VAT condition is now required, exact amounts and exchange rates are validated and canonically serialized, input errors expose stable codes and field paths, builders accept integer minor units with ISO `ARS`/`USD` input and an `ARS` default, and the legacy `ARCA_CURRENCIES` export is deprecated without changing its values.
