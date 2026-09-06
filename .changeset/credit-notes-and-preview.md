---
"facturas": minor
---

Replace `cancel()` with `issueCreditNote()` and add `preview()`.

`client.issueCreditNote(input, options)` writes an ordinary credit note against an authorized invoice, in one of two explicit modes: `{ for, items, total? }` credits chosen lines through the same amount pipeline as `issue()`, and `{ for, all: true }` mirrors the whole original line by line, which is what 0.9's `cancel()` did. The mode is required: neither, both, or `all` other than the literal `true` throws `ArcaInputError` with `ARCA_INPUT_INVALID_VALUE` before any I/O, so a forgotten field cannot credit the whole invoice. Everything except the credited lines, the note's own `salesPoint` and its `date` comes from the original: class and note type (1 → 3, 6 → 8, 11 → 13), receiver, currency and rate, concept and service dates. The note may not exceed the original's total, and the SDK does not track earlier notes against an original. The new `CreditNoteInput` type is exported.

`client.preview(input, options?)` is synchronous and pure: it derives what `issue()` would send with no store, WSAA, SOAP or next-number call, and returns `{ voucherClass, voucherType, amounts, request }`, where `request` is the exact `WsfeVoucherInput` minus the voucher number. It throws exactly the input errors `issue()` throws before its first call. The new `IssuePreview` type is exported.

Removals. `client.cancel()` and `VouchersService.cancel` are gone with no alias: `cancel(target)` becomes `issueCreditNote({ for: target, all: true })`. The exact layer loses the aliases and throwing methods deprecated in 0.9.0: `wsfe.authorizeVoucherOutcome()`, `wsmtxca.authorizeVoucherOutcome()`, `wsfe.authorizeVoucher()`, `wsmtxca.authorizeVoucher()` and `wsfe.createNextVoucher()`, together with the `WsfeAuthorizationResult` and `WsmtxcaAuthorizationResult` types they returned. Use `client.issue()`, or reserve a number and call `wsfe.issue()`.

Reservations now record `operation: "creditNote"`. A stored 0.9 record with `operation: "cancel"` is rejected as an invalid structure with `ArcaConfigurationError`; no released consumer wrote one, since `cancel()` shipped in 0.9.0 without adoption. A keyed replay of a credit note consults only the reserved note and reports `amounts` from the stored request, so `computedTotal` equals `sentTotal` and `vatAdjustment` is `0` on that path.

Declared type widening: `VouchersService` gains `issueCreditNote` and `preview` and loses `cancel`; hand-built typed mocks must follow. `issue()` is unchanged in signature, behaviour and results.
