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

- [Repository README](https://github.com/LaPyme/arca.ts#readme)
- [Examples directory](https://github.com/LaPyme/arca.ts/tree/main/examples)

The package exports:

- `facturas`
- `facturas/constants`
- `facturas/wsfe`
- `facturas/wsmtxca`
- `facturas/padron`
- `facturas/errors`
- `facturas/types`

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
