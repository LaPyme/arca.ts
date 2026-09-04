# facturas

Serious Node.js SDK for ARCA / AFIP web services, with strong WSFE and Padrón coverage and preserved WSMTXCA support.

## Install

```bash
pnpm add facturas
```

```bash
npm install facturas
```

## Documentation

For the full quick start, troubleshooting, and examples, see the repository docs:

- [Repository README](https://github.com/LaPyme/facturas#readme)
- [Examples directory](https://github.com/LaPyme/facturas/tree/main/examples)

The package exports:

- `facturas`
- `facturas/constants`
- `facturas/wsfe`
- `facturas/wsmtxca`
- `facturas/padron`
- `facturas/errors`
- `facturas/types`

The primary invoice path is `client.vouchers.issue()`, using an explicit
`issuer`, a fiscal `to` receiver, a required `salesPoint`, and integer-minor-unit
items. It derives A/B/C, VAT and totals, and returns `authorized`, `rejected`,
`indeterminate`, or `conflict`. Raw provider evidence is opt-in.

**Single-writer contract:** serialize per `(representedTaxId, salesPoint,
voucherType)`. The SDK does not coordinate writers; concurrent calls collide on
10016. Servers and queues must persist attempts and use
`client.wsfe.authorizeVoucherOutcome()` directly. The facade makes one write
attempt and at most one identity-matched recovery lookup, never a resubmission.

`buildFacturaB()` and `buildFacturaC()` retain their v0.7.1 behavior and are
exported from `facturas` and `facturas/wsfe`. The facade and builders accept ISO
`ARS`/`USD`; exact `WsfeVoucherInput` uses provider identifiers `PES`/`DOL`.
The only existing type widening in v0.8 is required `ArcaClient.vouchers`;
hand-built typed mocks must add that member.

`facturas` also exports `createMemoryWsaaSessionStore()` for tests/local single-process coordination and the small `ArcaWsaaSessionStore` interface for applications that need to share WSAA tickets across workers through their own durable store.

Authenticated WSFE and WSMTXCA methods accept `forceRefresh: true` when callers need to discard the cached WSAA TA and request a fresh Token Authorization for the same service. Convenience operations retry once with a forced refresh only after a typed `ArcaAuthenticationError`; an already forced call, transport failure, invalid response, or generic service rejection is never retried by this recovery path.

For durable fiscal workflows, `authorizeVoucherOutcome(...)` returns typed `authorized`, `rejected`, or `indeterminate` evidence and performs one authorization transport attempt. Explicit authentication rejection is represented by `reason: "authentication_rejected"` and safe authentication evidence without resubmitting. `lookupVoucher(...)` provides operation-scoped `found` or `not_found` recovery evidence. The existing `authorizeVoucher(...)`, `getVoucherInfo(...)`, and `getVoucher(...)` methods remain compatibility wrappers.

`createNextVoucher(...)` is a single-writer convenience. If authorization is explicitly rejected for authentication, it retries the same payload and the same previously fetched voucher number once; it does not fetch a new number.

## WSFE associated periods

`client.wsfe.createNextVoucher({ data })` supports `associatedPeriod` for credit/debit notes that use `PeriodoAsoc` instead of `CbtesAsoc`:

```ts
await client.wsfe.createNextVoucher({
  data: {
    // other voucher fields...
    associatedPeriod: {
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    },
  },
});
```
