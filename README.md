# arca.ts

`@lapyme/arca` is a Node.js client for ARCA web services. It currently covers WSAA authentication plus the first production-oriented service modules we use most often: `wsfe`, `wsmtxca`, and padron lookups.

The package is ESM-first, supports Node.js `>=20`, and defaults to a safe configuration for open-source use:

- WSAA credentials stay in memory by default.
- The documented public surface is intentionally narrow.

## Install

```bash
pnpm add @lapyme/arca
```

## Quick Start

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

const nextVoucher = await client.wsfe.getNextVoucherNumber({
  salesPoint: 1,
  voucherType: 6,
});

console.log(nextVoucher);
```

Expected environment variables:

- `ARCA_TAX_ID`
- `ARCA_CERTIFICATE_PEM`
- `ARCA_PRIVATE_KEY_PEM`
- `ARCA_ENVIRONMENT` with `test` or `production`

The helper defaults `ARCA_ENVIRONMENT` to `test` when it is omitted.

## Configuration

You can pass configuration directly instead of loading it from environment variables:

```ts
import { createArcaClient } from "@lapyme/arca";

const client = createArcaClient({
  taxId: "20123456789",
  certificatePem: process.env.ARCA_CERTIFICATE_PEM!,
  privateKeyPem: process.env.ARCA_PRIVATE_KEY_PEM!,
  environment: "test",
});
```

## Supported Modules

### `client.wsfe`

WSFE electronic invoicing. All inputs and outputs use JS-convention names; the library maps them to AFIP's SOAP schema internally.

- WSFE request date fields accept `YYYY-MM-DD` or `YYYYMMDD` strings.
- `createNextVoucher({ data })` — Authorizes a new voucher. Takes a typed `WsfeVoucherInput` and returns `WsfeAuthorizationResult` with `cae`, `caeExpiry`, `voucherNumber`, and `raw`.
- `getNextVoucherNumber({ salesPoint, voucherType })` — Returns the next available voucher number.
- `getLastVoucher({ salesPoint, voucherType })` — Deprecated alias for `getNextVoucherNumber()`.
- `getSalesPoints({})` — Lists configured points of sale as `WsfeSalesPoint[]`.
- `getVoucherInfo({ number, salesPoint, voucherType })` — Retrieves voucher details as `WsfeVoucherInfo | null`.

```ts
const result = await client.wsfe.createNextVoucher({
  data: {
    salesPoint: 1,
    voucherType: 6,
    concept: 1,
    documentType: 80,
    documentNumber: 30717329654,
    voucherDate: "20260501",
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

console.log(result.cae, result.caeExpiry, result.voucherNumber);
```

### `client.wsmtxca`

WSMTXCA electronic invoicing (Factura de Crédito Electrónica).

- `authorizeVoucher({ data })` — Returns `WsmtxcaAuthorizationResult`.
- `getLastAuthorizedVoucher({ voucherType, salesPoint })` — Returns `WsmtxcaLastAuthorizedVoucherResult`.
- `getVoucher({ voucherType, salesPoint, voucherNumber })` — Returns `WsmtxcaVoucherLookupResult`.

### `client.padron`

Padron taxpayer registry lookups.

- `getTaxpayerDetails(taxId)` — Returns `PadronTaxpayerResult | null` with `taxId`, `name`, `personType`, and `raw`.
- `getTaxIdByDocument(documentNumber)` — Returns `PadronTaxIdLookupResult | null` with `taxIds` and `raw`.

You can also import the service factories directly from documented subpaths:

```ts
import { createWsfeService } from "@lapyme/arca/wsfe";
import { ArcaServiceError } from "@lapyme/arca/errors";
import type { WsfeVoucherInput } from "@lapyme/arca/wsfe";
```

## Public API

Documented, semver-governed entrypoints:

- `@lapyme/arca`
- `@lapyme/arca/wsfe`
- `@lapyme/arca/wsmtxca`
- `@lapyme/arca/padron`
- `@lapyme/arca/errors`
- `@lapyme/arca/types`

Low-level SOAP, HTTP, and WSAA internals are intentionally not part of the public contract.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm pack:check
```

## Security Notes

- Treat your certificate and private key as secrets.
- WSAA credentials are cached in memory only and are never written to disk by this package.

## License

MIT
