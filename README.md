# facturas

[![npm version](https://img.shields.io/npm/v/facturas.svg)](https://www.npmjs.com/package/facturas)
[![CI](https://github.com/LaPyme/facturas/actions/workflows/ci.yml/badge.svg)](https://github.com/LaPyme/facturas/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](https://github.com/LaPyme/facturas/blob/main/LICENSE)

Serious Node.js SDK for ARCA / AFIP web services, with a strong WSFE and Padrón experience today and WSMTXCA support preserved. It talks to ARCA endpoints directly, keeps the public API strict and predictable, and avoids pushing SOAP naming into your application code.

- **ESM-only**, Node.js **>= 20**
- **Direct ARCA integration** with no proxy or hosted dependency
- **WSAA login handling** with in-memory ticket cache, optional durable session stores, in-flight deduplication, and recovery for `coe.alreadyAuthenticated`
- **Strict TypeScript** public API with JS-style field names mapped to SOAP internally
- **Common ARCA reference data** exported as constants so examples and app code do not need magic numbers
- **Copy-pasteable examples** designed to be readable by humans and coding agents

## Install

```bash
pnpm add facturas
```

```bash
npm install facturas
```

## Quick start

This example mirrors [examples/factura-b-consumidor-final.ts](./examples/factura-b-consumidor-final.ts).

```ts
import { buildFacturaB, createArcaClient } from "facturas";
import {
  ARCA_CONCEPT_TYPES,
  ARCA_DOCUMENT_TYPES,
  ARCA_RECEIVER_VAT_CONDITIONS,
} from "facturas/constants";

const client = createArcaClient({
  taxId: "20123456789",
  certificatePem:
    "-----BEGIN CERTIFICATE-----\nREPLACE_WITH_YOUR_CERTIFICATE\n-----END CERTIFICATE-----",
  privateKeyPem:
    "-----BEGIN PRIVATE KEY-----\nREPLACE_WITH_YOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----",
  environment: "test",
});

const data = buildFacturaB({
  salesPoint: 1,
  concept: ARCA_CONCEPT_TYPES.PRODUCTOS,
  documentType: ARCA_DOCUMENT_TYPES.CONSUMIDOR_FINAL,
  documentNumber: 0,
  receiverVatConditionId: ARCA_RECEIVER_VAT_CONDITIONS.CONSUMIDOR_FINAL,
  // Deterministic example date; use an ARCA-allowed current date in homologation.
  voucherDate: "2026-09-02",
  taxableAmount: 10_000, // Integer minor units: ARS 100.00.
  vatRate: 21,
  // currency is omitted, so the builder defaults to ISO ARS.
});

// Single-writer convenience: coordinate this sales-point/voucher-type lane.
const issued = await client.wsfe.createNextVoucher({
  data,
});

console.log(issued.cae, issued.caeExpiry, issued.voucherNumber);
```

`buildFacturaB()` derives the Factura B type, net amount, IVA detail, IVA
amount, zero-value fields, and total without floating-point tax arithmetic.
`buildFacturaC()` separately builds the zero-IVA Factura C shape. Both builders
accept integer currency minor units and support ISO `ARS` (the default) and
`USD`. Factura B requires a positive `taxableAmount`; when `vatRate` is
positive, the amount must produce at least one currency minor unit of IVA after
rounding. IVA uses the Round Half Even criterion documented by ARCA, so an
exact half-cent is rounded to the even cent.

For a USD invoice, pass a decimal-string exchange rate:

```ts
const usdData = buildFacturaB({
  salesPoint: 1,
  concept: ARCA_CONCEPT_TYPES.PRODUCTOS,
  documentType: ARCA_DOCUMENT_TYPES.CONSUMIDOR_FINAL,
  documentNumber: 0,
  receiverVatConditionId: ARCA_RECEIVER_VAT_CONDITIONS.CONSUMIDOR_FINAL,
  voucherDate: "2026-09-02",
  taxableAmount: 10_000, // USD 100.00.
  vatRate: 21,
  currency: "USD",
  exchangeRate: "1095.500000",
});
```

## What You Can Do Today

### WSFE

- Issue invoices and credit notes with `client.wsfe.createNextVoucher(...)`
- Query voucher numbers and voucher details
- Read ARCA catalogs with methods like `getVoucherTypes()` and `getVatRates()`
- Check backend health with `getServerStatus()`

### Padrón

- Look up taxpayer data with `client.padron.getTaxpayerDetails(...)`
- Resolve CUITs from document numbers with `client.padron.getTaxIdByDocument(...)`

### WSMTXCA

WSMTXCA remains supported and exported, but this package currently puts most editorial focus on WSFE and Padrón. If you need `authorizeVoucher`, `authorizeVoucherOutcome`, `getLastAuthorizedVoucher`, `lookupVoucher`, `getVoucher`, or `getSalesPoints`, the runtime API is available and covered by tests.

## Exact authorization and recovery evidence

Use `authorizeVoucherOutcome(...)` with a caller-owned, durably reserved voucher
number when your application must decide whether one exact fiscal attempt was
authorized, rejected, or left indeterminate. It preserves every structured
error and observation with its service, operation, code, source, and result
level.

```ts
const outcome = await client.wsfe.authorizeVoucherOutcome({
  voucherNumber: reservedVoucherNumber,
  data,
});

if (outcome.kind === "authorized") {
  console.log(outcome.cae, outcome.voucherNumber);
} else if (outcome.kind === "rejected") {
  console.error(outcome.errors, outcome.observations);
} else {
  if (outcome.reason === "authentication_rejected") {
    console.error(outcome.authentication?.reason);
  }
  // Consult the same number before any new authorization attempt.
  const lookup = await client.wsfe.lookupVoucher({
    number: reservedVoucherNumber,
    salesPoint: data.salesPoint,
    voucherType: data.voucherType,
  });
  console.log(lookup.kind);
}
```

Authorization outcome methods force one SOAP transport attempt, even when the client has general transport retries configured. They never refresh credentials and resubmit automatically. An explicit provider authentication rejection is returned as `reason: "authentication_rejected"` with safe typed `authentication` evidence; a timeout, connection failure, invalid response, or incomplete/contradictory result remains indeterminate without resubmission. This prevents uncertain fiscal work from causing a hidden second authorization.

The convenience `authorizeVoucher(...)` methods keep their success-or-throw
contract and may repeat the exact same payload once after an explicit typed
authentication rejection. WSFE `createNextVoucher(...)` applies the same rule
to the number it already fetched; it never fetches another number for the retry.
Authenticated read, catalog, and lookup convenience operations also perform at
most one forced-refresh retry. Passing `forceRefresh: true` disables any further
authentication recovery attempt.

Exact lookup absence is operation-specific:

- WSFE `FECompConsultar` code 602 returns `not_found`.
- WSMTXCA `consultarComprobante` code 1503 returns `not_found`.
- WSMTXCA `consultarUltimoComprobanteAutorizado` code 1502 returns voucher number `0`.
- WSMTXCA code 602 is not exact-voucher absence and remains an error.

The SDK normalizes provider protocol evidence only. Your application remains responsible for persisting the exact request, owning its sequence or lane, and deciding when a retry is safe.

For exemptions, non-taxable amounts, tributes, multiple IVA rates, notes, or
other advanced cases, use the exact `WsfeVoucherInput` escape hatch. Exact
amounts remain major-unit numbers, are validated locally, and are serialized as
canonical two-decimal strings:

```ts
import type { WsfeVoucherInput } from "facturas/wsfe";
import {
  ARCA_CONCEPT_TYPES,
  ARCA_CURRENCY_IDS,
  ARCA_DOCUMENT_TYPES,
  ARCA_RECEIVER_VAT_CONDITIONS,
  ARCA_VAT_RATES,
  ARCA_VOUCHER_TYPES,
} from "facturas/constants";

const exactData: WsfeVoucherInput = {
  salesPoint: 1,
  voucherType: ARCA_VOUCHER_TYPES.FACTURA_B,
  concept: ARCA_CONCEPT_TYPES.PRODUCTOS,
  documentType: ARCA_DOCUMENT_TYPES.CONSUMIDOR_FINAL,
  documentNumber: 0,
  receiverVatConditionId: ARCA_RECEIVER_VAT_CONDITIONS.CONSUMIDOR_FINAL,
  voucherDate: "2026-09-02",
  totalAmount: 121,
  nonTaxableAmount: 0,
  netAmount: 100,
  exemptAmount: 0,
  taxAmount: 0,
  vatAmount: 21,
  currencyId: ARCA_CURRENCY_IDS.ARS,
  exchangeRate: "1",
  vatRates: [{ id: ARCA_VAT_RATES.IVA_21, baseAmount: 100, amount: 21 }],
};
```

Exact inputs and live catalog responses use ARCA protocol identifiers such as
`PES` and `DOL`; only the high-level builders accept ISO `ARS` and `USD`.

### Migrating amount and currency inputs

Applications that previously rounded decimal major-unit values and translated
currencies to ARCA IDs can move that provider-boundary work into a builder:

```ts
// Before: caller-owned decimal rounding and provider vocabulary.
const exactAmount = Number(sourceAmount.toFixed(2));
const exactCurrencyId = sourceCurrency === "ARS" ? "PES" : "DOL";

// After: integer minor units and ISO currency input.
const data = buildFacturaB({
  salesPoint: 1,
  concept: ARCA_CONCEPT_TYPES.PRODUCTOS,
  documentType: ARCA_DOCUMENT_TYPES.CONSUMIDOR_FINAL,
  documentNumber: 0,
  receiverVatConditionId: ARCA_RECEIVER_VAT_CONDITIONS.CONSUMIDOR_FINAL,
  voucherDate: "2026-09-02",
  taxableAmount: 10_000, // 100.00 in the selected currency.
  vatRate: 21,
  currency: "USD",
  exchangeRate: "1095.5",
});
```

Keep using `WsfeVoucherInput` when you need advanced exact fields. Its amounts
remain decimal major-unit values and its `currencyId` remains an ARCA ID.

## Examples

Examples live in [examples/](./examples) and are intentionally complete, hardcoded, and readable so they can be adapted quickly by a developer or a coding agent.
Issuance examples use deterministic dates for compilation; replace them with an
ARCA-allowed current date before a homologation request.

- [factura-b-consumidor-final.ts](./examples/factura-b-consumidor-final.ts)
- [factura-a-responsable-inscripto.ts](./examples/factura-a-responsable-inscripto.ts)
- [nota-de-credito-asociada.ts](./examples/nota-de-credito-asociada.ts)
- [factura-servicios-con-periodo.ts](./examples/factura-servicios-con-periodo.ts)
- [consultar-comprobante.ts](./examples/consultar-comprobante.ts)
- [consultar-contribuyente.ts](./examples/consultar-contribuyente.ts)

## Manual Setup Reality

This package does **not** provision ARCA credentials for you. You still need to do the official certificate and service setup outside the SDK.

Before using the SDK:

1. Obtain a valid CUIT.
2. Generate or receive a certificate and matching private key in PEM format.
3. Authorize the certificate for the target service and environment.
4. Start with `environment: "test"` and move to production only after end-to-end validation.

Official ARCA / AFIP references:

- [WSAA documentation](https://www.afip.gob.ar/ws/documentacion/wsaa.asp)
- [Certificates for testing / homologation](https://www.afip.gob.ar/ws/documentacion/certificados.asp)
- [WSAA developer manual](https://www.afip.gob.ar/ws/WSAA/WSAAmanualDev.pdf)
- [WSASS service onboarding](https://www.afip.gob.ar/ws/WSASS/WSASS_como_adherirse.pdf)
- [WSFE developer manual](https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf)

## Reference Data

The package exports a small, stable set of common ARCA codes from `facturas/constants`.

```ts
import {
  ARCA_CONCEPT_TYPES,
  ARCA_CURRENCY_IDS,
  ARCA_CURRENCIES,
  ARCA_DOCUMENT_TYPES,
  ARCA_RECEIVER_VAT_CONDITIONS,
  ARCA_VAT_RATES,
  ARCA_VOUCHER_TYPES,
  ISO_CURRENCIES,
} from "facturas/constants";

ARCA_VOUCHER_TYPES.FACTURA_A; // 1
ARCA_VOUCHER_TYPES.FACTURA_B; // 6
ARCA_DOCUMENT_TYPES.CUIT; // 80
ARCA_DOCUMENT_TYPES.DNI; // 96
ARCA_DOCUMENT_TYPES.CONSUMIDOR_FINAL; // 99
ARCA_RECEIVER_VAT_CONDITIONS.RESPONSABLE_INSCRIPTO; // 1
ARCA_RECEIVER_VAT_CONDITIONS.CONSUMIDOR_FINAL; // 5
ARCA_CONCEPT_TYPES.SERVICIOS; // 2
ARCA_VAT_RATES.IVA_21; // 5
ISO_CURRENCIES.ARS; // "ARS"
ARCA_CURRENCY_IDS.USD; // "DOL"
ARCA_CURRENCIES.PES; // "PES"
ARCA_CURRENCIES.DOL; // "DOL"
```

The constants cover the most common values used by the README and examples:

- voucher types for invoice A/B/C, debit note A/B/C, and credit note A/B/C
- document types for CUIT, DNI, and final consumers
- common receiver IVA conditions, subject to voucher-class and live-catalog rules
- concept types for products, services, and products + services
- IVA rates for `0`, `2.5`, `5`, `10.5`, `21`, and `27`
- builder ISO currencies `ARS` and `USD`, with explicit ARCA mappings to `PES`
  and `DOL`

`ARCA_CURRENCIES` remains a deprecated compatibility alias with its existing
`PES` and `DOL` values. If you need broader catalogs at runtime, WSFE methods
such as `getVoucherTypes()`, `getDocumentTypes()`, `getCurrencyTypes()`, and
`getVatRates()` are still available. `getCurrencyTypes()` returns live ARCA
identifiers, not ISO codes.

## Configuration

Pass a config object to `createArcaClient`:

```ts
import { createArcaClient } from "facturas";

const client = createArcaClient({
  taxId: "20123456789",
  certificatePem: process.env.ARCA_CERTIFICATE_PEM!,
  privateKeyPem: process.env.ARCA_PRIVATE_KEY_PEM!,
  environment: "test",
  timeout: 30_000,
  retries: 2,
  retryDelay: 500,
  logger: { level: "debug" },
  // Optional: share WSAA login tickets across workers.
  // wsaaSessionStore,
});
```

| Field | Default | Description |
| --- | --- | --- |
| `taxId` | — | 11-digit CUIT |
| `certificatePem` | — | PEM certificate |
| `privateKeyPem` | — | PEM private key |
| `environment` | — | `test` or `production` |
| `timeout` | `30000` | HTTP request timeout in milliseconds |
| `retries` | `0` | Extra attempts after transport failures only |
| `retryDelay` | `500` | Delay between transport retries in milliseconds |
| `logger` | — | Optional structured logger config |
| `wsaaSessionStore` | — | Optional WSAA ticket store for multi-worker deployments |

### WSAA session stores

By default, WSAA login tickets are cached in the current process only. That keeps scripts and single-process apps zero-config:

```ts
const client = createArcaClient({
  taxId: "20123456789",
  certificatePem: process.env.ARCA_CERTIFICATE_PEM!,
  privateKeyPem: process.env.ARCA_PRIVATE_KEY_PEM!,
  environment: "production",
});
```

Serverless functions, queue workers, and multi-process deployments should provide a durable `wsaaSessionStore` so a valid TA can be reused by every worker instead of each cold process calling WSAA independently.

```ts
import {
  type ArcaAuthCredentials,
  type ArcaWsaaSessionKey,
  createArcaClient,
} from "facturas";

const wsaaSessionStore = {
  async get(key: ArcaWsaaSessionKey): Promise<ArcaAuthCredentials | null> {
    // Read from Postgres, Redis, or another shared store.
    return null;
  },
  async set(
    key: ArcaWsaaSessionKey,
    credentials: ArcaAuthCredentials
  ): Promise<void> {
    // Persist token, sign, and expiresAt for the key.
  },
  async withLock<T>(
    key: ArcaWsaaSessionKey,
    fn: () => Promise<T>
  ): Promise<T> {
    // Optional but recommended: serialize cold-start refreshes.
    return await fn();
  },
};

const client = createArcaClient({
  taxId: "20123456789",
  certificatePem: process.env.ARCA_CERTIFICATE_PEM!,
  privateKeyPem: process.env.ARCA_PRIVATE_KEY_PEM!,
  environment: "production",
  wsaaSessionStore,
});
```

The store key is scoped by environment, WSAA service, and certificate fingerprint. Store reads are still checked with the SDK's expiration safety margin. A production store should share data across all workers, encrypt or rely on encrypted storage, enforce expiration on read, and implement locking with advisory locks, Redis locks, or equivalent.

For tests and local coordination through one shared object, the package also exports `createMemoryWsaaSessionStore()`.

### Environment variables

If you prefer env-based wiring, `createArcaClientConfigFromEnv()` reads:

| Variable | Required | Notes |
| --- | --- | --- |
| `ARCA_TAX_ID` | Yes | 11-digit CUIT |
| `ARCA_CERTIFICATE_PEM` | Yes | PEM certificate |
| `ARCA_PRIVATE_KEY_PEM` | Yes | PEM private key |
| `ARCA_ENVIRONMENT` | No | `test` or `production`; defaults to `test` |

For logging without code changes, set `ARCA_LOG_LEVEL` to `debug`, `info`, `warn`, or `error`.

## Logging

Default minimum level is `warn`. At `debug`, the SDK logs SOAP requests, response timings, WSAA login source (`cached` vs `fresh`), and retry attempts.

```ts
const client = createArcaClient({
  taxId: "20123456789",
  certificatePem: "...",
  privateKeyPem: "...",
  environment: "test",
  logger: { level: "debug" },
});
```

Custom logger sinks receive `(level, message, ...args)`:

```ts
const client = createArcaClient({
  taxId: "20123456789",
  certificatePem: "...",
  privateKeyPem: "...",
  environment: "production",
  logger: {
    level: "info",
    log(level, message, ...args) {
      // forward to your logger
    },
  },
});
```

Disable logging entirely with `logger: { disabled: true }`.

## Retries and timeouts

Configured transport retries apply only to `ArcaTransportError`: timeouts, connection failures, and non-XML HTTP error responses. XML responses, including HTTP 500 SOAP faults, are parsed and surfaced as SOAP or service errors instead of being retried blindly.

Separately, authenticated WSFE and WSMTXCA convenience operations may perform
one forced-refresh retry only after `ArcaAuthenticationError`. Timeouts,
connection loss, invalid SOAP, incomplete evidence, contradictory evidence, and
generic service rejections never unlock this recovery path. Both
`authorizeVoucherOutcome(...)` methods always perform one exact authorization
attempt, and each authorization SOAP attempt has transport retries set to zero.

## Service Surface

### `client.wsfe`

WSFE electronic invoicing. Inputs use JS-style names and the SDK maps them to AFIP / ARCA SOAP fields internally.

- Date fields accept `YYYY-MM-DD` or `YYYYMMDD`.
- `createNextVoucher({ data })` resolves the next number and requests CAE in one call.
- `getVoucherInfo({ number, salesPoint, voucherType })` returns voucher details or `null`.
- Catalog methods are available for live reference data when you do not want to hardcode values.
- Authenticated methods accept `forceRefresh: true` to discard the cached WSAA TA and request a fresh Token Authorization for the same service.

### `client.padron`

- `getTaxpayerDetails(taxId)` returns taxpayer data or `null`
- `getTaxIdByDocument(documentNumber)` returns CUIT candidates or `null`

Padron "not found" handling currently depends on SOAP fault message text from ARCA and is therefore more fragile than WSFE code-based flows.

### `client.wsmtxca`

- `authorizeVoucher({ data })`
- `getLastAuthorizedVoucher({ voucherType, salesPoint })`
- `getVoucher({ voucherType, salesPoint, voucherNumber })`
- Authenticated methods accept `forceRefresh: true` to renew the WSMTXCA WSAA TA before the call.

The runtime support is stable and public. It is simply not the main documentation path in this SDK-focused pass.

## Error handling

All errors extend `ArcaError` and expose a stable `code` string.

| Class | When |
| --- | --- |
| `ArcaConfigurationError` | Invalid client config |
| `ArcaInputError` | Invalid caller input such as a malformed date |
| `ArcaAuthenticationError` | Explicit provider authentication rejection |
| `ArcaTransportError` | HTTP or transport failure |
| `ArcaSoapFaultError` | SOAP fault returned by ARCA |
| `ArcaServiceError` | Business-level service rejection, especially WSFE-style errors |

```ts
import {
  ArcaAuthenticationError,
  ArcaServiceError,
  ArcaSoapFaultError,
  ArcaTransportError,
} from "facturas";

try {
  await client.wsfe.createNextVoucher({ data: /* ... */ });
} catch (error) {
  if (error instanceof ArcaAuthenticationError) {
    console.error(
      error.reason,
      error.service,
      error.operation,
      error.providerCode
    );
  } else if (error instanceof ArcaServiceError) {
    console.error(error.serviceCode, error.message);
  } else if (error instanceof ArcaSoapFaultError) {
    console.error(error.faultCode, error.message);
  } else if (error instanceof ArcaTransportError) {
    console.error(error.statusCode, error.message);
  }
  throw error;
}
```

Import error classes from `facturas` or `facturas/errors`.
`isArcaAuthenticationError(error)` is also exported for predicate-style
routing. Authentication errors expose only the stable code
`ARCA_AUTHENTICATION_ERROR`, a typed `reason`, service, operation, and a safe
provider code when available; raw provider bodies and credential values are not
attached.

## Troubleshooting

- `coe.alreadyAuthenticated`: the SDK deduplicates in-flight WSAA logins and reuses valid cached tickets. In serverless, queue workers, or any multi-process deployment, configure a durable `wsaaSessionStore` so cold workers can reuse the TA obtained by another process. Memory-only caching cannot recover across processes.
- `dh key too small`: WSFE production requests already use a legacy OpenSSL security level where needed. If you still see this, confirm you are not bypassing the SDK transport or terminating TLS in another layer.
- Expired certificate: replace the PEM certificate with a renewed one that matches the same private key expectations, then redeploy or restart the process.
- Unauthorized service: your certificate may be valid but not authorized for the target service or environment. Re-check WSASS / homologation setup for test and service relationships for production.
- WSFE `10015`: usually means the `DocTipo` / `DocNro` combination is inconsistent for the voucher type and amount. For example, Factura B has special receiver-document rules depending on the total amount.
- WSFE `10016`: the voucher number sent in `CbteDesde` is not the next valid one for that point of sale and voucher type. Call `getNextVoucherNumber()` immediately before authorizing when your numbering may have moved.

When an error is unclear, check these in order:

1. Certificate and private key match.
2. Environment is correct (`test` vs `production`).
3. Service authorization was done for that environment.
4. The voucher type, document type, and amount combination is valid.
5. Your process is not reusing stale assumptions about the next voucher number.

## Public API (semver)

Documented entrypoints:

- `facturas`
- `facturas/constants`
- `facturas/wsfe`
- `facturas/wsmtxca`
- `facturas/padron`
- `facturas/errors`
- `facturas/types`

Low-level SOAP, HTTP, and WSAA internals are not part of the semver contract.

Subpath example:

```ts
import { createWsfeService } from "facturas/wsfe";
import { ARCA_VOUCHER_TYPES } from "facturas/constants";
import { ArcaServiceError } from "facturas/errors";
```

## Security

- Treat certificates and private keys as secrets.
- By default, WSAA tickets are cached in memory only.
- This package does not write credentials to disk unless your application provides a custom `wsaaSessionStore` that does so.
- Production `wsaaSessionStore` implementations should encrypt credentials at rest or use a backend that provides encryption at rest.

## Development

```bash
pnpm install
pnpm typecheck
pnpm typecheck:examples
pnpm test
pnpm test:coverage
pnpm pack:check
```

Optional for local DX: install Turbo globally with `pnpm add --global turbo`. The repo scripts still use the local workspace version.

## License

Apache-2.0
