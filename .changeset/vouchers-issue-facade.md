---
"facturas": minor
---

Add `client.vouchers.issue()` for single-writer A/B/C invoices from explicit
issuer and receiver assertions and integer-minor-unit items. Group net/gross
items by VAT rate with Round Half Even rounding; expose computed and sent totals
and any bounded VAT adjustment. Derive receiver identification, currency,
service dates and the RG 5866 final-consumer identification threshold.

Return `authorized`, `rejected`, `indeterminate`, or `conflict` without retrying
an authorization. Recover only after a complete identity match, expose the pure
`matchWsfeVoucherIdentity()` helper, and extend consultation details with VAT,
taxes and service dates. Evidence is raw-free unless explicitly included.

All existing exports retain their names, signatures and runtime behavior,
including the v0.7.1 builders. The one declared type widening is required
`ArcaClient.vouchers`: hand-built typed client mocks must add this member.
The SDK does not coordinate writers; serialize per represented taxpayer,
sales point and voucher type, or use the exact API with durable attempts.
