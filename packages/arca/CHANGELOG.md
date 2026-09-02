# facturas

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
