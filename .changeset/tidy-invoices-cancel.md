---
"facturas": minor
---

Add durable idempotency keys for invoice issuance and full associated credit notes through `cancel()`. Bundle Postgres, Redis, file and memory stores without runtime driver dependencies; one store also persists WSAA tickets.

The facade moves onto the client: `client.vouchers.issue()` is now `client.issue()` and the new credit note is `client.cancel()`. On the exact layer, `wsfe.authorizeVoucherOutcome()` and `wsmtxca.authorizeVoucherOutcome()` are renamed to `issue()`; the old names remain as deprecated aliases for one release. The throwing `authorizeVoucher()` methods are removed and `createNextVoucher()` is deprecated. `createArcaClient()` now throws when neither `environment` nor `ARCA_ENVIRONMENT` is set, instead of silently using `test`. A keyed retry whose reserved number is already occupied by a different voucher now returns `conflict` instead of `rejected`.

Declared type widenings: client credential fields are optional and discovered from the environment; `ArcaClientConfig` gains `store`; `IssueOptions` gains `idempotencyKey`; `VouchersService` gains `cancel`, which hand-built typed mocks must implement. `issue()` without an idempotency key is unchanged.
