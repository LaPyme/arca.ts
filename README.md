# arca.ts

[![npm version](https://img.shields.io/npm/v/@lapyme/arca.svg)](https://www.npmjs.com/package/@lapyme/arca)
[![CI](https://github.com/LaPyme/arca.ts/actions/workflows/ci.yml/badge.svg)](https://github.com/LaPyme/arca.ts/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](https://github.com/LaPyme/arca.ts/blob/main/LICENSE)

Serious Node.js SDK for ARCA / AFIP web services, with a strong WSFE and Padrón experience today and WSMTXCA support preserved. It talks to ARCA endpoints directly, keeps the public API strict and predictable, and avoids pushing SOAP naming into your application code.

- **ESM-only**, Node.js **>= 20**
- **Direct ARCA integration** with no proxy or hosted dependency
- **WSAA login handling** with in-memory ticket cache, in-flight deduplication, and recovery for `coe.alreadyAuthenticated`
- **Strict TypeScript** public API with JS-style field names mapped to SOAP internally
- **Common ARCA reference data** exported as constants so examples and app code do not need magic numbers
- **Copy-pasteable examples** designed to be readable by humans and coding agents

## Install

```bash
pnpm add @lapyme/arca
```

```bash
npm install @lapyme/arca
```

## Quick start

This example mirrors [examples/factura-b-consumidor-final.ts](./examples/factura-b-consumidor-final.ts).

```ts
import { createArcaClient } from "@lapyme/arca";
import {
  ARCA_CONCEPT_TYPES,
  ARCA_CURRENCIES,
  ARCA_DOCUMENT_TYPES,
  ARCA_VAT_RATES,
  ARCA_VOUCHER_TYPES,
} from "@lapyme/arca/constants";

const client = createArcaClient({
  taxId: "20123456789",
  certificatePem:
    "-----BEGIN CERTIFICATE-----\nREPLACE_WITH_YOUR_CERTIFICATE\n-----END CERTIFICATE-----",
  privateKeyPem:
    "-----BEGIN PRIVATE KEY-----\nREPLACE_WITH_YOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----",
  environment: "test",
});

const issued = await client.wsfe.createNextVoucher({
  data: {
    salesPoint: 1,
    voucherType: ARCA_VOUCHER_TYPES.FACTURA_B,
    concept: ARCA_CONCEPT_TYPES.PRODUCTOS,
    documentType: ARCA_DOCUMENT_TYPES.DNI,
    documentNumber: 30123456,
    voucherDate: "2026-05-01",
    totalAmount: 121,
    nonTaxableAmount: 0,
    netAmount: 100,
    exemptAmount: 0,
    taxAmount: 0,
    vatAmount: 21,
    currencyId: ARCA_CURRENCIES.PES,
    exchangeRate: 1,
    vatRates: [
      {
        id: ARCA_VAT_RATES.IVA_21,
        baseAmount: 100,
        amount: 21,
      },
    ],
  },
});

console.log(issued.cae, issued.caeExpiry, issued.voucherNumber);
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

WSMTXCA remains supported and exported, but this package currently puts most editorial focus on WSFE and Padrón. If you need `authorizeVoucher`, `getLastAuthorizedVoucher`, or `getVoucher`, the runtime API is available and covered by tests.

## Examples

Examples live in [examples/](./examples) and are intentionally complete, hardcoded, and readable so they can be adapted quickly by a developer or a coding agent.

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
- [WSFE developer manual](https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG-v4-0.pdf)

## Reference Data

The package exports a small, stable set of common ARCA codes from `@lapyme/arca/constants`.

```ts
import {
  ARCA_CONCEPT_TYPES,
  ARCA_CURRENCIES,
  ARCA_DOCUMENT_TYPES,
  ARCA_VAT_RATES,
  ARCA_VOUCHER_TYPES,
} from "@lapyme/arca/constants";

ARCA_VOUCHER_TYPES.FACTURA_A; // 1
ARCA_VOUCHER_TYPES.FACTURA_B; // 6
ARCA_DOCUMENT_TYPES.CUIT; // 80
ARCA_DOCUMENT_TYPES.DNI; // 96
ARCA_CONCEPT_TYPES.SERVICIOS; // 2
ARCA_VAT_RATES.IVA_21; // 5
ARCA_CURRENCIES.PES; // "PES"
ARCA_CURRENCIES.DOL; // "DOL"
```

The constants cover the most common values used by the README and examples:

- voucher types for invoice A/B, debit note A/B, and credit note A/B
- document types for CUIT and DNI
- concept types for products, services, and products + services
- IVA rates for `0`, `10.5`, `21`, and `27`
- common currencies `PES` and `DOL`

If you need broader catalogs at runtime, WSFE methods such as `getVoucherTypes()`, `getDocumentTypes()`, `getCurrencyTypes()`, and `getVatRates()` are still available.

## Configuration

Pass a config object to `createArcaClient`:

```ts
import { createArcaClient } from "@lapyme/arca";

const client = createArcaClient({
  taxId: "20123456789",
  certificatePem: process.env.ARCA_CERTIFICATE_PEM!,
  privateKeyPem: process.env.ARCA_PRIVATE_KEY_PEM!,
  environment: "test",
  timeout: 30_000,
  retries: 2,
  retryDelay: 500,
  logger: { level: "debug" },
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

Retries apply only to `ArcaTransportError`: timeouts, connection failures, and non-XML HTTP error responses. XML responses, including HTTP 500 SOAP faults, are parsed and surfaced as SOAP or service errors instead of being retried blindly.

## Service Surface

### `client.wsfe`

WSFE electronic invoicing. Inputs use JS-style names and the SDK maps them to AFIP / ARCA SOAP fields internally.

- Date fields accept `YYYY-MM-DD` or `YYYYMMDD`.
- `createNextVoucher({ data })` resolves the next number and requests CAE in one call.
- `getVoucherInfo({ number, salesPoint, voucherType })` returns voucher details or `null`.
- Catalog methods are available for live reference data when you do not want to hardcode values.

### `client.padron`

- `getTaxpayerDetails(taxId)` returns taxpayer data or `null`
- `getTaxIdByDocument(documentNumber)` returns CUIT candidates or `null`

Padron "not found" handling currently depends on SOAP fault message text from ARCA and is therefore more fragile than WSFE code-based flows.

### `client.wsmtxca`

- `authorizeVoucher({ data })`
- `getLastAuthorizedVoucher({ voucherType, salesPoint })`
- `getVoucher({ voucherType, salesPoint, voucherNumber })`

The runtime support is stable and public. It is simply not the main documentation path in this SDK-focused pass.

## Error handling

All errors extend `ArcaError` and expose a stable `code` string.

| Class | When |
| --- | --- |
| `ArcaConfigurationError` | Invalid client config |
| `ArcaInputError` | Invalid caller input such as a malformed date |
| `ArcaTransportError` | HTTP or transport failure |
| `ArcaSoapFaultError` | SOAP fault returned by ARCA |
| `ArcaServiceError` | Business-level service rejection, especially WSFE-style errors |

```ts
import {
  ArcaServiceError,
  ArcaSoapFaultError,
  ArcaTransportError,
} from "@lapyme/arca";

try {
  await client.wsfe.createNextVoucher({ data: /* ... */ });
} catch (error) {
  if (error instanceof ArcaServiceError) {
    console.error(error.serviceCode, error.message);
  } else if (error instanceof ArcaSoapFaultError) {
    console.error(error.faultCode, error.message);
  } else if (error instanceof ArcaTransportError) {
    console.error(error.statusCode, error.message);
  }
  throw error;
}
```

Import error classes from `@lapyme/arca` or `@lapyme/arca/errors`.

## Troubleshooting

- `coe.alreadyAuthenticated`: the SDK already deduplicates in-flight WSAA logins and reuses valid cached tickets. If you still hit this repeatedly, avoid forcing fresh auth unnecessarily and check whether another process is racing with the same certificate.
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

- `@lapyme/arca`
- `@lapyme/arca/constants`
- `@lapyme/arca/wsfe`
- `@lapyme/arca/wsmtxca`
- `@lapyme/arca/padron`
- `@lapyme/arca/errors`
- `@lapyme/arca/types`

Low-level SOAP, HTTP, and WSAA internals are not part of the semver contract.

Subpath example:

```ts
import { createWsfeService } from "@lapyme/arca/wsfe";
import { ARCA_VOUCHER_TYPES } from "@lapyme/arca/constants";
import { ArcaServiceError } from "@lapyme/arca/errors";
```

## Security

- Treat certificates and private keys as secrets.
- WSAA tickets are cached in memory only.
- This package does not write credentials to disk.

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
