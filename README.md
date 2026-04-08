# arca.ts

`@lapyme/arca` is a Node.js client for ARCA web services. It currently covers WSAA authentication plus the first production-oriented service modules we use most often: `wsfe`, `wsmtxca`, and padron lookups.

The package is ESM-first, supports Node.js `>=20`, and defaults to a safe configuration for open-source use:

- WSAA credentials stay in memory by default.
- Disk-backed WSAA caching is opt-in and requires an explicit directory.
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

const nextVoucher = await client.wsfe.getLastVoucher({
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

### Opt-in disk cache for WSAA credentials

By default, WSAA login tickets are cached in memory only. To persist them across process restarts, enable disk cache explicitly:

```ts
import { createArcaClient } from "@lapyme/arca";

const client = createArcaClient({
  taxId: "20123456789",
  certificatePem: process.env.ARCA_CERTIFICATE_PEM!,
  privateKeyPem: process.env.ARCA_PRIVATE_KEY_PEM!,
  environment: "production",
  wsaa: {
    cache: {
      mode: "disk",
      directory: ".arca-wsaa-cache",
    },
  },
});
```

Environment-based configuration also supports:

- `ARCA_WSAA_CACHE_MODE` with `memory` or `disk`
- `ARCA_WSAA_CACHE_DIRECTORY` when `ARCA_WSAA_CACHE_MODE=disk`

## Supported Modules

- `client.wsfe`
  - `createNextVoucher`
  - `getLastVoucher`
  - `getSalesPoints`
  - `getVoucherInfo`
- `client.wsmtxca`
  - `authorizeVoucher`
  - `getLastAuthorizedVoucher`
  - `getVoucher`
- `client.padron`
  - `getTaxpayerDetails`
  - `getTaxIdByDocument`

You can also import the service factories directly from documented subpaths:

```ts
import { createWsfeService } from "@lapyme/arca/wsfe";
import { ArcaServiceError } from "@lapyme/arca/errors";
```

## Public API

Documented, semver-governed entrypoints for `0.1.x`:

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
- Default in-memory WSAA caching avoids silent disk writes.
- If you enable disk cache, point it at a directory with appropriate filesystem permissions for your runtime.

## License

MIT
