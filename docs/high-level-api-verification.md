# High-level API completion and verification

Verified 2026-09-06. This is one SDK change covering the invoice and note needs
identified in La Pyme's fiscal callers. Application adoption is a separate
change. The public terminology is **high-level API**.

## Consumer inventory and implementation

The inspected La Pyme checkout had HEAD `62051fed0`. Its current sources, plus
the active billing/backoffice adoption task, establish the consumer contract.

| Consumer need | SDK implementation | Main regression coverage |
| --- | --- | --- |
| Ordinary A/B/C; A con leyenda; FCE | `family`, issuer/receiver class derivation, named `fce` fields | Invoice and linked-note family tables |
| Sales perceptions and tributes | Minor-unit `taxes`; preserve full-note taxes; explicit partial-note tax choice | Reviewed invoice, full and partial taxed notes |
| Existing fiscal totals and VAT rows | `amounts` mode and optional reviewed `total` | Historical VAT and accepted reconciliation differences preserved |
| Debit notes; credits against debit notes | `issueDebitNote`, expanded linked targets | Invoice → debit → full/partial credit by family |
| Period notes | `associatedPeriod` without an invented original | WSFE and WSMTXCA period paths; reversed-period rejection |
| Receiver catalogs; service concepts; currencies | Numeric receiver conditions, mixed concepts, currency IDs and payment flag | Consumer receiver matrix and extended-field validation |
| Detailed WSMTXCA | Explicit service selection, typed items and provider encoding | Actual service adapters with mocked SOAP; wire request and lookup assertions |
| Existing ledger reservations | `number` skips allocation; stable `idempotencyKey` | No next-number call; replay cannot replace the reserved number |
| Billing reconciliation | `recover` only consults the stored provider/number | Found, absent, incomplete, conflicting and failed evidence |
| Preview and result ergonomics | Invoice and note previews; typed provider-specific `request`/`sent` | Compiled examples and installed-package type contract |

The inspected consumer sources were `packages/shared/src/afip-voucher-request.ts`,
`afip-service.ts`, `arca-fiscal-evidence.ts`, and commerce's fiscal document-type
and issuance paths. Commerce creates one linked association, or an associated
period. Its business accounting, stock and refund-balance decisions remain in
the application. No La Pyme source or dependency manifest was changed here.

## Reproducible SDK checks

Run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm fix
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm check
pnpm --filter facturas check:exports
pnpm pack:check
pnpm exec changeset status
```

All checks passed. The SDK suite contains **526 passing tests in 25 files**.
Type checking includes the examples. Export checks build the package, validate
runtime entrypoints/error identities, and compile consumer type assertions.
The changeset schedules a minor release; opening this PR does not publish it.

## Packaged La Pyme compatibility

With La Pyme's dependencies already installed:

```sh
node packages/arca/scripts/check-lapyme-consumer.mjs /path/to/lapyme
```

The script packs this SDK, installs the tarball in a temporary directory, and
points an isolated TypeScript/Vitest configuration at that installed candidate.
It leaves the consumer checkout and its dependency tree unchanged. The generated
configuration and candidate are retained in the printed temporary directory.

The existing fiscal adapter sources typecheck against the candidate. All **46
tests across four existing consumer suites** pass:

- `afip-service.unit.test.ts`
- `afip-voucher-request.unit.test.ts`
- `arca-fiscal-evidence.unit.test.ts`
- `facturas-wsmtxca-serialization.unit.test.ts`

This proves compatibility with those existing adapters, including the actual
XML serialization exercised by the consumer's mocked transport. It does not
claim that La Pyme has already migrated every caller to the new API.

## Release and rollback boundary

The provider contracts are recorded in [the official-source notes](external/README.md).
The [input guide](high-level-api.md) documents the full supported CAE scope and
application responsibilities. Exact service APIs remain available for manual
control and services outside this invoice/note scope.

No live homologation or production fiscal documents were created for this
change. Live homologation, package publication and consumer deployment remain
rollout steps. Existing WSFE v1 store records remain readable. A rollback to
0.10 must not try to replay new WSMTXCA/debit-note reservations: retain the store
and use this version's consultation-only recovery for those records before
switching an affected consumer back. Never delete a reservation to retry issuance.
