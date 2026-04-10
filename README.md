# arca.ts

[![npm version](https://img.shields.io/npm/v/@lapyme/arca.svg)](https://www.npmjs.com/package/@lapyme/arca)
[![CI](https://github.com/LaPyme/arca.ts/actions/workflows/ci.yml/badge.svg)](https://github.com/LaPyme/arca.ts/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/LaPyme/arca.ts/blob/main/LICENSE)

Type-safe Node.js client for [ARCA](https://www.arca.gob.ar/) / AFIP web services: WSAA authentication, WSFE and WSMTXCA electronic invoicing, and Padrón taxpayer lookups. It talks to AFIP endpoints directly (no third-party proxy, no vendor lock-in).

- **ESM-only**, Node.js **>= 20**
- **Two runtime dependencies:** `fast-xml-parser`, `node-forge`
- **Strict TypeScript** public API; JS-friendly names map to SOAP internally
- **WSAA:** in-memory ticket cache, deduplicated in-flight logins, recovery for `coe.alreadyAuthenticated`
- **Resilience:** configurable HTTP timeout, optional retries on transport failures only (never on SOAP faults)
- **Observability:** optional structured logging (`console` by default, or your own sink)

## Install

```bash
pnpm add @lapyme/arca
```

```bash
npm install @lapyme/arca
```

## Prerequisites

You need a **CUIT**, a **digital certificate** authorized for the web services you call, and the matching **private key** (PEM). ARCA’s own guides cover certificate creation and service authorization; this package assumes you already have PEM strings or files you can read at runtime.

Use **`test`** until you are ready for production endpoints.

## Quick start

```ts
import {
  createArcaClient,
  createArcaClientConfigFromEnv,
} from "@lapyme/arca";

const client = createArcaClient(
  createArcaClientConfigFromEnv({
    defaultEnvironment: "test",
  })
);

const nextNumber = await client.wsfe.getNextVoucherNumber({
  salesPoint: 1,
  voucherType: 6,
});

const issued = await client.wsfe.createNextVoucher({
  data: {
    salesPoint: 1,
    voucherType: 6,
    concept: 1,
    documentType: 80,
    documentNumber: 30717329654,
    voucherDate: "2026-05-01",
    totalAmount: 121,
    nonTaxableAmount: 0,
    netAmount: 100,
    exemptAmount: 0,
    taxAmount: 0,
    vatAmount: 21,
    currencyId: "PES",
    exchangeRate: 1,
    vatRates: [{ id: 5, baseAmount: 100, amount: 21 }],
  },
});

console.log(issued.cae, issued.caeExpiry, issued.voucherNumber);
```

### Environment variables

`createArcaClientConfigFromEnv` reads:

| Variable | Required | Notes |
| --- | --- | --- |
| `ARCA_TAX_ID` | Yes | 11-digit CUIT |
| `ARCA_CERTIFICATE_PEM` | Yes | PEM certificate |
| `ARCA_PRIVATE_KEY_PEM` | Yes | PEM private key |
| `ARCA_ENVIRONMENT` | No | `test` or `production`; defaults to `test` if omitted |

For logging verbosity without code changes, set **`ARCA_LOG_LEVEL`** to `debug`, `info`, `warn`, or `error` (see [Logging](#logging)).

## Configuration

Pass an object to `createArcaClient`:

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
| `timeout` | `30000` | HTTP request timeout (ms) |
| `retries` | `0` | Extra attempts after a transport failure |
| `retryDelay` | `500` | Fixed delay (ms) between retries |
| `logger` | — | See [Logging](#logging) |

Merge env-based config with overrides when needed:

```ts
const client = createArcaClient({
  ...createArcaClientConfigFromEnv({ defaultEnvironment: "test" }),
  retries: 2,
  timeout: 45_000,
});
```

## Logging

Default minimum level is **`warn`**. At `debug`, the client logs SOAP requests (service, operation, URL), responses (duration), WSAA login source (cached vs fresh), and retry attempts.

```ts
const client = createArcaClient({
  taxId: "20123456789",
  certificatePem: "...",
  privateKeyPem: "...",
  environment: "test",
  logger: { level: "debug" },
});
```

Custom sink (same shape as better-auth style: level + message + args):

```ts
const client = createArcaClient({
  taxId: "20123456789",
  certificatePem: "...",
  privateKeyPem: "...",
  environment: "production",
  logger: {
    level: "info",
    log(level, message, ...args) {
      // send to your logging pipeline
    },
  },
});
```

Set **`ARCA_LOG_LEVEL`** when you do not pass `logger.level`. Disable entirely with `logger: { disabled: true }`.

## Retries and timeouts

Retries apply only to **`ArcaTransportError`** (timeouts, connection failures, non-XML HTTP error responses). Responses that are XML—including HTTP500 with a SOAP **Fault**—are **not** retried; they surface as `ArcaSoapFaultError` or domain errors after parsing.

## `client.wsfe`

WSFE electronic invoicing. Inputs use JS-style names; the library maps to AFIP’s SOAP fields.

- WSFE **date** fields accept **`YYYY-MM-DD`** or **`YYYYMMDD`** strings and validate calendar dates.

### Invoicing

| Method | Description |
| --- | --- |
| `createNextVoucher({ data })` | Resolves next number and requests CAE; returns `cae`, `caeExpiry`, `voucherNumber`, `raw` |
| `getNextVoucherNumber({ salesPoint, voucherType })` | Next available voucher number |
| `getLastVoucher(...)` | Deprecated alias of `getNextVoucherNumber` |
| `getVoucherInfo({ number, salesPoint, voucherType })` | Voucher details or `null` |

Optional on these calls: `representedTaxId`, `forceAuthRefresh` (where applicable).

### Points of sale

| Method | Description |
| --- | --- |
| `getSalesPoints({})` | Lists `WsfeSalesPoint[]` |

### Reference data (catalogs)

| Method | WSFE operation | Returns |
| --- | --- | --- |
| `getVoucherTypes` | `FEParamGetTiposCbte` | `WsfeCatalogEntry[]` |
| `getDocumentTypes` | `FEParamGetTiposDoc` | `WsfeCatalogEntry[]` |
| `getConceptTypes` | `FEParamGetTiposConcepto` | `WsfeCatalogEntry[]` |
| `getCurrencyTypes` | `FEParamGetTiposMonedas` | `WsfeCurrencyType[]` |
| `getVatRates` | `FEParamGetTiposIva` | `WsfeCatalogEntry[]` |
| `getTaxTypes` | `FEParamGetTiposTributos` | `WsfeCatalogEntry[]` |
| `getOptionalTypes` | `FEParamGetTiposOpcional` | `WsfeCatalogEntry[]` |
| `getQuotation({ currencyId })` | `FEParamGetCotizacion` | `WsfeQuotation` |

### Server status

| Method | Description |
| --- | --- |
| `getServerStatus()` | `FEDummy` — app, DB, and auth server status (`WsfeServerStatus`); no WSAA ticket required |

## `client.wsmtxca`

Factura de Crédito Electrónica (WSMTXCA).

| Method | Description |
| --- | --- |
| `authorizeVoucher({ data })` | `WsmtxcaAuthorizationResult` |
| `getLastAuthorizedVoucher({ voucherType, salesPoint })` | Last authorized number |
| `getVoucher({ voucherType, salesPoint, voucherNumber })` | Voucher lookup |

## `client.padron`

| Method | Description |
| --- | --- |
| `getTaxpayerDetails(taxId)` | A5 taxpayer details or `null` if not found |
| `getTaxIdByDocument(documentNumber)` | A13 CUIT list or `null` if not found |

Not-found for Padrón is detected via SOAP fault message text (fragile if AFIP changes wording); see implementation notes in source.

## Error handling

All errors extend **`ArcaError`** (`code` string). Specialize with `instanceof`:

| Class | When |
| --- | --- |
| `ArcaConfigurationError` | Invalid client config |
| `ArcaInputError` | Invalid caller input (e.g. bad date string) |
| `ArcaTransportError` | HTTP/transport failure (`statusCode`, `responseBody` optional) |
| `ArcaSoapFaultError` | SOAP Fault (`faultCode`, `detail` optional) |
| `ArcaServiceError` | WSFE-style business errors (`serviceCode`, `detail` optional) |

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

## Public API (semver)

Documented entrypoints:

- `@lapyme/arca`
- `@lapyme/arca/wsfe`
- `@lapyme/arca/wsmtxca`
- `@lapyme/arca/padron`
- `@lapyme/arca/errors`
- `@lapyme/arca/types`

Low-level SOAP, HTTP, and WSAA internals are **not** part of the semver contract.

Subpath example:

```ts
import { createWsfeService } from "@lapyme/arca/wsfe";
import { ArcaServiceError } from "@lapyme/arca/errors";
import type { WsfeVoucherInput } from "@lapyme/arca/wsfe";
```

## Security

- Treat certificate and private key as secrets.
- WSAA tickets are cached **in memory only**; this package does not write credentials to disk.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm pack:check
```

## License

MIT
