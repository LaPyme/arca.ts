# facturas

## 0.7.1

### Patch Changes

- ea2bf1a: Correct Factura B IVA calculations at exact half-cent boundaries to use ARCA's documented Round Half Even criterion.
- 0dc9adf: Restore the schema-required WSMTXCA SOAP field order so `authRequest` is serialized before each operation payload.

## 0.7.0

### Minor Changes

- 58d12a1: Add deterministic WSFE money handling and high-level Factura B/C builders. Receiver VAT condition is now required, exact amounts and exchange rates are validated and canonically serialized, input errors expose stable codes and field paths, builders accept integer minor units with ISO `ARS`/`USD` input and an `ARS` default, and the legacy `ARCA_CURRENCIES` export is deprecated without changing its values.
- d12a5b8: Establish the v0.7.0 safe diagnostics contract. `client.config` now exposes an immutable credential-free operational view, transport and invalid-SOAP errors replace full response bodies with bounded redacted metadata, parsed provider details are removed from public errors, and internal logger events receive only safe scalar diagnostics.
- 7c7bb9c: Add typed ARCA authentication failures and one proven-safe forced-refresh recovery attempt to authenticated convenience operations. Exact authorization outcome methods remain single-attempt and now expose safe authentication-rejection evidence; transport, parser, incomplete, contradictory, and generic service failures are never automatically resubmitted. Strengthen the packed runtime and declaration consumer contract for builders, currency constants, errors, and exact WSFE types.

## 0.6.1

### Patch Changes

- c2f7277: Reject encrypted PKCS#8 and legacy RSA private keys during configuration, preserve forced WSAA refresh intent under local concurrency, and reject caller-supplied WSMTXCA authentication fields before network work. Normalize omitted peso exchange rates to one, validate foreign exchange rates, add common ARCA voucher, document, receiver IVA condition, and VAT rate constants, and correct the invoice examples.

## 0.6.0

### Minor Changes

- b4006df: Add structured WSFE and WSMTXCA authorization outcomes, operation-scoped exact voucher lookup, corrected consultation fields, and source-level WSMTXCA sales-point support. Exact authorization now disables transport retries so uncertain callers can consult before resubmission.

## 0.5.2

### Patch Changes

- d4af327: Upgrade fast-xml-parser to the patched v5 line and refresh repository links before public announcement.
- d4af327: Publish ESM-only package entrypoints with explicit `.mjs` runtime files and default export conditions.

## 0.5.1

### Patch Changes

- Expose `forceRefresh` consistently on authenticated WSFE and WSMTXCA methods so callers can renew the service-specific WSAA Token Authorization before retrying auth failures.

## 0.5.0

### Minor Changes

- 6d09e04: add memory support for the arca client

### Patch Changes

- 0a2f1e2: bug fixes
