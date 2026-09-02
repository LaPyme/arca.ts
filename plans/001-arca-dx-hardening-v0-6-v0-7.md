# Plan 001: Deliver the v0.6.1 safety patch and v0.7.0 DX contract

> **Executor instructions**: Follow this plan in order. Each named PR is a
> separate review unit. Run every verification command and confirm the expected
> result before moving to the next PR. Do not merge, push, publish, or open a PR
> unless the operator separately instructs you to do so. If any STOP condition
> occurs, stop and report it. Do not improvise.
>
> **Target-base check (run first)**: this plan was prepared from checkout
> `b4006df`, while the audited published source on `origin/main` was `ff1c868`.
> The source trees were identical; only the consumed changeset, changelog, and
> package version differed. Fetch first, start implementation from the latest
> `origin/main`, and run:
>
> ```bash
> git diff --stat ff1c868..HEAD -- \
>   .github README.md examples package.json tsconfig.examples.json \
>   packages/arca/package.json packages/arca/README.md \
>   packages/arca/scripts packages/arca/src
> ```
>
> If this reports changes made after `ff1c868`, compare the live files with the
> Current state section. Stop if the target contract or any cited control flow
> has changed materially.

## Status

- **Priority**: P1
- **Effort**: L, approximately five reviewable PRs across several days
- **Risk**: HIGH because this changes public fiscal input and error contracts
- **Depends on**: none
- **Category**: DX, correctness, security, tests, and release integrity
- **Planned at**: checkout `b4006df`, target `origin/main` `ff1c868`, 2026-09-02

## Why this matters

`facturas` has strong fiscal outcome and WSAA lifecycle design, but its common
invoice input still makes consumers perform decimal rounding, amount
reconciliation, ARCA currency translation, and authentication-fault matching.
Its quick start also omits the receiver VAT condition that current ARCA rules
require. Separately, a release run can publish a different `main` commit from
the commit that triggered successful CI, and public client/error objects can
expose credential or unbounded provider-response data.

This program first ships a non-breaking v0.6.1 safety patch. It then ships a
v0.7.0 DX contract with deterministic money handling, small Factura B and C
builders, ISO currency input with an `ARS` default, actionable input errors,
typed authentication failures, and safe diagnostics. The exact WSFE input and
the one-attempt fiscal evidence API remain available for advanced and durable
workflows.

## Fixed design decisions

These are implementation requirements, not open questions:

1. `authorizeVoucherOutcome()` continues to perform one exact authorization
   SOAP attempt with transport retries set to zero. It never performs automatic
   authentication recovery.
2. `createNextVoucher()` remains public. Documentation must call it a
   single-writer convenience. It must not claim to provide durable sequencing.
3. New high-level builders use ISO 4217 codes. They support `ARS` and `USD` in
   v0.7.0. Omitted currency means `ARS`.
4. ARCA protocol identifiers stay at the exact/provider boundary:
   `ARS -> PES` and `USD -> DOL`. Do not make `ARS`, `PES`, `USD`, and `DOL`
   interchangeable values of one ambiguous input field.
5. Builder monetary values are non-negative safe integers in the ISO currency's
   minor unit. For the supported currencies, `10_000` means 100.00. Exchange
   rates are canonical decimal strings, not floating-point money values.
6. `buildFacturaB()` derives the VAT detail, VAT amount, zero-value fields, and
   total from one taxable amount and one supported VAT rate.
7. `buildFacturaC()` is a separate builder. Factura C has zero VAT and no VAT
   array. Do not reuse the Factura B calculation.
8. `WsfeVoucherInput` remains the advanced exact-input escape hatch. Its
   `currencyId` continues to represent an ARCA identifier.
9. An automatic authorization retry is allowed only after the first response is
   positively classified as an authentication rejection that proves the fiscal
   operation did not run. Transport errors, timeouts, invalid XML, missing
   evidence, and generic service errors are never automatically retried.
10. Public errors and logger metadata must never contain PEM material, WSAA
    Token/Sign values, full response bodies, or unrestricted parsed SOAP trees.

## Current state

### Repository and release controls

- The workspace uses pnpm 10, Turborepo, TypeScript 5.9, Vitest 4, tsup, and
  Changesets. Root scripts are in `package.json`.
- `.github/workflows/ci.yml:15` tests Node 20 and 22. It runs typecheck, tests,
  coverage, and pack check, but not `pnpm check` or `check:exports`.
- `.github/workflows/release.yml:3-25` receives a successful `workflow_run` and
  performs a bare `actions/checkout@v4`. That checkout is not bound to
  `github.event.workflow_run.head_sha`.
- Release uses Changesets to create the version PR or run
  `pnpm changeset publish`. The checkout must therefore remain on `main`; a
  detached checkout of `head_sha` is not a complete fix.

### Configuration and credential exposure

- `packages/arca/src/config.ts:29-33` accepts
  `BEGIN ENCRYPTED PRIVATE KEY`, but `packages/arca/src/wsaa/index.ts:429-434`
  passes the PEM directly to `node-forge` without a passphrase or decryption
  path.
- `packages/arca/src/client.ts:10-35` declares `config: ArcaClientConfig` on the
  public client and returns the normalized config, including certificate and
  private-key PEM values.

Current public client shape:

```ts
// packages/arca/src/client.ts:10-16,33-38
export type ArcaClient = {
  config: ArcaClientConfig;
  wsfe: WsfeService;
  wsmtxca: WsmtxcaService;
  padron: PadronService;
};

return {
  config: normalizedConfig,
  wsfe: createWsfeService({ config: normalizedConfig, auth, soap }),
  wsmtxca: createWsmtxcaService({ config: normalizedConfig, auth, soap }),
  padron: createPadronService({ config: normalizedConfig, auth, soap }),
};
```

### WSAA concurrency

- `packages/arca/src/wsaa/index.ts:54-75` stores one promise per session key and
  returns it before it examines `authOptions.forceRefresh`.
- A forced refresh that races an ordinary login therefore receives the ordinary
  result and may return a stale TA.
- `packages/arca/src/wsaa/index.test.ts:127-209` covers ordinary in-flight
  deduplication and sequential force refresh, but not the mixed concurrent case.

Current race:

```ts
// packages/arca/src/wsaa/index.ts:54-75
const inFlight = new Map<string, Promise<ArcaAuthCredentials>>();

const running = inFlight.get(cacheKey);
if (running) {
  return running;
}

// forceRefresh is only read later
allowStore: !authOptions.forceRefresh,
allowCache: !authOptions.forceRefresh,
```

### WSFE input and fiscal safety

- `packages/arca/src/services/wsfe.ts:74-101` requires callers to provide all
  monetary totals as JavaScript numbers and makes `receiverVatConditionId`
  optional.
- `packages/arca/src/services/wsfe.ts:766-805` sends those numbers directly as
  `ImpTotal`, `ImpNeto`, `ImpIVA`, and other SOAP fields. It performs no scale or
  total reconciliation.
- The same mapper rejects an absent exchange rate even for `PES`, although the
  public type marks `exchangeRate` optional.
- `README.md:49-72` and `examples/factura-b-consumidor-final.ts:20-43` omit
  `receiverVatConditionId`.
- `packages/arca/src/services/wsfe.ts:533-566` hard-codes zero transport retries
  for `FECAESolicitar`. Preserve this behavior.
- `packages/arca/src/services/wsfe.ts:643-657` implements
  `createNextVoucher()` as a read followed by authorization with no sequencing
  lock. The README already states that the application owns its fiscal lane.

Current exact mapper excerpt:

```ts
// packages/arca/src/services/wsfe.ts:782-801
const data: Record<string, unknown> = {
  ImpTotal: input.totalAmount,
  ImpTotConc: input.nonTaxableAmount,
  ImpNeto: input.netAmount,
  ImpOpEx: input.exemptAmount,
  ImpTrib: input.taxAmount,
  ImpIVA: input.vatAmount,
  MonId: input.currencyId,
};

if (!sendsSameForeignCurrencyCancellation) {
  data.MonCotiz = input.exchangeRate;
}
```

### WSMTXCA authentication precedence

- `packages/arca/src/services/wsmtxca.ts:17-21` makes authorization data a
  public `Record<string, unknown>`.
- `packages/arca/src/services/wsmtxca.ts:165-172` inserts trusted
  `authRequest` first and spreads public `data` after it. A caller-provided
  `authRequest` can replace the trusted credentials.

```ts
body: {
  authRequest: createWsmtxcaAuth(/* trusted values */),
  ...body,
},
```

### Constants and currency vocabulary

- `packages/arca/src/constants.ts` contains voucher types A and B only,
  document types CUIT and DNI only, and ARCA currency IDs `PES` and `DOL`.
- Missing common constants include Factura/ND/NC C (`11`, `12`, `13`), document
  type `99`, receiver VAT conditions, and VAT rates 5% and 2.5%.
- New builders must use ISO `ARS` and `USD`, while the exact request retains
  ARCA `PES` and `DOL`.

### Errors and logging

- `packages/arca/src/errors.ts:44-63` exposes an unbounded `responseBody` on
  `ArcaTransportError`.
- `packages/arca/src/errors.ts:85-119` exposes `parsedDetail` on invalid SOAP
  responses.
- `packages/arca/src/internal/http.ts:68-90` passes full error objects to the
  logger, and lines 159-218 attach partial or complete bodies to transport
  errors.
- `packages/arca/src/internal/xml.ts:130-156` bounds and redacts response
  previews, but still stores the unrestricted parsed detail.
- `packages/arca/src/soap/index.ts:104-124` logs full SOAP error objects.
- `ArcaInputError` has only the generic `ARCA_INPUT_ERROR` code and an untyped
  `detail`; consumers cannot route reliably by field and reason.

### Consumer evidence that defines the DX target

The primary known consumer currently has to:

- round VAT bases, VAT values, tax totals, and invoice totals with repeated
  `Number(value.toFixed(2))` calls before invoking `facturas`;
- translate its currency vocabulary to ARCA `PES` and `DOL`;
- cast application strings to `WsfeDateInput`; and
- serialize errors and match Spanish authentication messages before calling the
  same operation with `forceRefresh: true`.

The package must absorb the provider-boundary parts of that work without
absorbing application-owned fiscal sequencing or persistence.

## Commands you will need

Run from the `facturas` repository root.

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | exit 0; lockfile unchanged |
| Format | `pnpm fix` | exit 0 |
| Lint/check | `pnpm check` | exit 0; no findings |
| Typecheck | `pnpm typecheck` | exit 0; source and examples compile |
| Tests | `pnpm test` | exit 0; all tests pass |
| Coverage | `pnpm test:coverage` | exit 0 |
| Export contract | `pnpm --filter facturas check:exports` | exit 0 |
| Package contents | `pnpm pack:check` | exit 0 |
| Runtime audit | `pnpm audit --prod` | exit 0; no production advisory |
| Patch hygiene | `git diff --check` | no output; exit 0 |

For focused work, use Vitest directly through the package script:

```bash
pnpm --filter facturas test -- src/config.test.ts
pnpm --filter facturas test -- src/wsaa/index.test.ts
pnpm --filter facturas test -- src/services/wsfe.test.ts
pnpm --filter facturas test -- src/services/wsmtxca.test.ts
pnpm --filter facturas test -- src/errors.test.ts src/internal/http.test.ts src/internal/xml.test.ts
```

## Scope

**In scope**:

- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `.changeset/*.md` files created for this program
- `README.md`
- `examples/*.ts`
- `package.json` only if a root verification script must change
- `tsconfig.examples.json` only if documented consumer compilation needs it
- `packages/arca/README.md`
- `packages/arca/package.json`
- `packages/arca/scripts/check-package-exports.mjs`
- a new package-consumer type fixture/config under `packages/arca/scripts/`
- `packages/arca/src/client.ts` and `client.test.ts`
- `packages/arca/src/config.ts` and `config.test.ts`
- `packages/arca/src/constants.ts` and `constants.test.ts`
- `packages/arca/src/errors.ts` and `errors.test.ts`
- `packages/arca/src/index.ts`, `wsfe.ts`, `errors.ts`, and relevant barrel tests
- `packages/arca/src/internal/http.ts`, `http.test.ts`, `xml.ts`, `xml.test.ts`,
  and new internal decimal/redaction helpers with focused tests
- `packages/arca/src/services/wsfe.ts`, `wsfe.test.ts`, and a new
  `wsfe-builders.ts` with its test
- `packages/arca/src/services/wsmtxca.ts` and `wsmtxca.test.ts`
- `packages/arca/src/services/fiscal-evidence.ts` only for a typed explicit
  authentication-rejection reason
- `packages/arca/src/soap/index.ts` and `index.test.ts`
- `packages/arca/src/wsaa/index.ts` and `index.test.ts`

**Out of scope**:

- Any La Pyme source or database migration. La Pyme may add a small adapter in a
  separate repository task after v0.7.0 is released.
- Live production ARCA calls.
- WSFEX, CAEA, or new FCE capabilities.
- A complete typed model for WSMTXCA authorization data.
- Removal of low-level service factories or export of SOAP/WSAA constructors.
- Removal of existing compatibility methods.
- Changes to durable fiscal sequencing, voucher reservation, or persistence.
- Automatic retry after timeout, connection loss, invalid XML, incomplete
  response, or any other indeterminate authorization outcome.
- Release publication, version-PR merge, npm credential changes, or provenance
  operations by the executor.
- A broad service-module refactor unrelated to the behavior in this plan.

## Git and release workflow

- Work from a fresh branch or worktree based on the latest `origin/main`. Do not
  implement on the stale `agent/typed-arca-evidence` checkout.
- Suggested branches:
  - `codex/release-integrity`
  - `codex/v0-6-1-safety`
  - `codex/v0-7-diagnostic-safety`
  - `codex/v0-7-money-builders`
  - `codex/v0-7-auth-recovery`
- Use one commit per logical step. Existing history accepts conventional commit
  messages; use `fix:`, `feat:`, `test:`, `docs:`, or `ci:` prefixes.
- Every package-behavior PR needs a Changesets file. The v0.6.1 safety PR uses
  a patch changeset. At least one v0.7.0 PR uses a minor changeset.
- After the v0.6.1 implementation PR lands, a maintainer must review and merge
  the generated Changesets release PR before v0.7.0 release work is published.
- For v0.7.0, allow the implementation changesets to accumulate. Do not merge
  the generated release PR until every v0.7.0 PR and acceptance gate passes.
- Do not push, open PRs, merge, or publish unless explicitly instructed.

## PR 1: Bind releases to tested commits and enforce package contracts

### Step 1.1: Make release checkout deterministic

Edit `.github/workflows/release.yml`:

1. Checkout `ref: main` with full history. Keep a branch checkout because the
   Changesets action creates or updates a version PR.
2. Immediately after checkout, compare `git rev-parse HEAD` with
   `${{ github.event.workflow_run.head_sha }}` supplied through an environment
   variable.
3. Fail the job before installation, build, Changesets, or npm publication when
   the SHAs differ. A newer successful `main` workflow will produce its own
   release event.
4. Scope concurrency to the release workflow and `main`, not an ambiguous
   `workflow_run` ref.
5. Keep the success-conclusion check and current least permissions. Do not add
   secrets or use a pull-request head ref.

Target shape:

```yaml
- uses: actions/checkout@v4
  with:
    ref: main
    fetch-depth: 0

- name: Verify that CI tested this release commit
  env:
    TESTED_SHA: ${{ github.event.workflow_run.head_sha }}
  run: |
    actual_sha="$(git rev-parse HEAD)"
    if [[ "$actual_sha" != "$TESTED_SHA" ]]; then
      echo "main advanced after the triggering CI run; refusing to release"
      exit 1
    fi
```

Do not replace this with checkout of only `head_sha`; that creates a detached
HEAD and breaks the version-PR half of the Changesets workflow.

**Verify**:

```bash
git diff --check -- .github/workflows/release.yml
```

Expected: no output, exit 0. Hosted CI is the final workflow-syntax and event
acceptance gate.

### Step 1.2: Enforce lint, exports, packaging, and Node 24 in CI

Edit `.github/workflows/ci.yml` so that:

1. The runtime matrix covers Node 20, 22, and 24.
2. Each runtime performs `pnpm typecheck` and `pnpm test`.
3. One Node 24 contract job, or Node-24-only conditional steps, performs:
   `pnpm check`, `pnpm test:coverage`,
   `pnpm --filter facturas check:exports`, and `pnpm pack:check`.
4. Coverage does not repeat the full test suite on all three Node versions.
5. All installs remain frozen and pnpm caching remains enabled.

**Verify**:

```bash
pnpm check
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm --filter facturas check:exports
pnpm pack:check
git diff --check -- .github/workflows/ci.yml
```

Expected: every command exits 0. The PR's hosted checks must show successful
Node 20, 22, and 24 jobs before this PR is eligible to land.

### PR 1 done criteria

- [ ] Release checkout is on `main` and refuses a SHA different from the
      triggering successful CI run.
- [ ] Changesets still receives a branch checkout.
- [ ] CI covers Node 20, 22, and 24.
- [ ] CI enforces lint, types, tests, coverage, exports, and package contents.
- [ ] No package changeset is added for workflow-only changes.
- [ ] All local gates listed in Step 1.2 pass.

## PR 2: Ship v0.6.1 non-breaking safety and quick-start fixes

### Step 2.1: Reject encrypted private keys at configuration time

Edit `packages/arca/src/config.ts` so that
`BEGIN ENCRYPTED PRIVATE KEY` is not in the accepted usable-key prefixes.
Detect it explicitly and throw an `ArcaConfigurationError` whose message says
that encrypted private keys are not supported and that the caller must provide
an unencrypted PKCS#8 or RSA PEM. Do not wait for the first WSAA login and do
not add passphrase support in this plan.

Add focused tests to `packages/arca/src/config.test.ts` for direct config and
environment-loaded config. Assert the error class, stable generic config code,
and actionable message. Never include real PEM material in fixtures.

**Verify**:

```bash
pnpm --filter facturas test -- src/config.test.ts
```

Expected: all config tests pass, including two encrypted-key rejection cases.

### Step 2.2: Preserve forced-refresh intent under local concurrency

Refactor the local in-flight coordination in
`packages/arca/src/wsaa/index.ts`. Use explicit ordinary and forced work state,
or an equivalent state machine, with these semantics:

1. Ordinary callers join existing ordinary work.
2. Ordinary callers may join existing forced work because the forced result is
   fresh enough for them.
3. Forced callers join existing forced work.
4. A forced caller that arrives during ordinary work waits for that ordinary
   work to settle and then starts exactly one deduplicated forced refresh.
5. Multiple forced callers waiting behind the same ordinary work join one
   forced leader.
6. A rejected ordinary promise must not prevent the queued forced attempt.
7. Promise cleanup must compare identity so an older completion cannot delete a
   newer in-flight entry.
8. Do not solve this by keying the current map with a force flag or by starting
   a second WSAA call in parallel. Either approach can create simultaneous WSAA
   logins and trigger `coe.alreadyAuthenticated`.
9. Preserve durable-store locking and recovery behavior.

Add deterministic deferred-promise tests to
`packages/arca/src/wsaa/index.test.ts` for all mixed cases above. Assert exact
WSAA call counts and returned token identities.

**Verify**:

```bash
pnpm --filter facturas test -- src/wsaa/index.test.ts
```

Expected: all WSAA tests pass; mixed ordinary/forced concurrency makes two
serial WSAA calls, never two parallel calls, and all forced waiters receive the
second token.

### Step 2.3: Protect WSMTXCA authentication fields

Edit `packages/arca/src/services/wsmtxca.ts`:

1. Reject authorization `data` that owns the reserved top-level key
   `authRequest` before any auth or SOAP call.
2. Build the body by spreading caller data first and adding the trusted
   `authRequest` last.
3. Throw `ArcaInputError` with an actionable message. The specific input-code
   upgrade will come in v0.7.0.

Add tests to `packages/arca/src/services/wsmtxca.test.ts` that prove a reserved
key is rejected locally, auth/SOAP are not called, and trusted authentication is
last in the final body.

**Verify**:

```bash
pnpm --filter facturas test -- src/services/wsmtxca.test.ts
```

Expected: all WSMTXCA tests pass and the reserved-key test performs no network
operation.

### Step 2.4: Make the optional peso exchange rate truthful

Edit the exact WSFE mapper in `packages/arca/src/services/wsfe.ts`:

- For `currencyId: "PES"`, an omitted `exchangeRate` normalizes to `1` and sends
  `MonCotiz: 1`.
- A provided peso exchange rate must still be `1`; invalid values fail locally.
- A non-peso voucher still requires a positive exchange rate unless
  `sameCurrencyForeignCancellation` is `"S"`.
- Same-currency foreign cancellation continues to omit `MonCotiz` when no rate
  is provided.

Add table-driven tests to `packages/arca/src/services/wsfe.test.ts` for all four
cases. Do not change the authorization retry count.

**Verify**:

```bash
pnpm --filter facturas test -- src/services/wsfe.test.ts
```

Expected: all WSFE tests pass and the new tests assert the exact mapped fields.

### Step 2.5: Add common constants and repair every invoice example

Extend `packages/arca/src/constants.ts` and its tests with:

- `FACTURA_C: 11`, `NOTA_DEBITO_C: 12`, `NOTA_CREDITO_C: 13`;
- document type `CONSUMIDOR_FINAL: 99`;
- receiver VAT conditions for Responsable Inscripto `1`, Exento `4`,
  Consumidor Final `5`, Monotributista `6`, and IVA No Alcanzado `15`, with a
  JSDoc warning that allowed values depend on voucher class and live catalog;
- VAT rate IDs for 5% (`8`) and 2.5% (`9`);
- keep `ARCA_CURRENCIES` unchanged in v0.6.1 for compatibility.

Update `README.md` and all issuance examples so every request includes the
appropriate `receiverVatConditionId`. The Factura B consumer-final quick start
uses receiver VAT condition `5`. Make the single-writer limitation visible next
to the first `createNextVoucher()` example, not only in advanced documentation.

Do not claim a hard-coded historical voucher date can receive a CAE today. The
example may remain deterministic for compilation, but the optional homologation
smoke must substitute an allowed current date.

**Verify**:

```bash
pnpm --filter facturas test -- src/constants.test.ts src/barrels.test.ts
pnpm typecheck:examples
rg -n "receiverVatConditionId" README.md examples
```

Expected: tests and example typecheck pass; every issuance example has a
receiver VAT condition match.

### Step 2.6: Add the v0.6.1 patch changeset and run the release gate

Create one clear patch changeset for package `facturas`. Describe the local
configuration error, forced-refresh race fix, WSMTXCA reserved-key protection,
peso exchange-rate default, constants, and corrected examples. Do not edit the
package version or changelog manually.

Run:

```bash
pnpm fix
pnpm check
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm --filter facturas check:exports
pnpm pack:check
pnpm audit --prod
git diff --check
```

Expected: every command exits 0. `git status --short` contains only PR 2 scope
and one new changeset.

### Maintainer gate: publish v0.6.1

Stop after the implementation PR is ready. A maintainer must merge it, inspect
the release workflow's tested-SHA guard, review the generated version PR, and
explicitly authorize its merge/publication. Record the published npm version
and provenance result before starting the v0.7.0 release gate.

## PR 3: Establish the v0.7.0 safe diagnostics contract

### Step 3.1: Remove credentials from the public client view

Define and export a public redacted client-config type that contains only safe
operational fields such as `taxId`, `environment`, `timeout`, `retries`, and
`retryDelay`. It must not contain certificate PEM, private-key PEM, logger
callbacks, or session-store objects.

Keep the full normalized config in private closures for WSAA, SOAP, and service
construction. Return an immutable redacted object as `client.config`. Add tests
that serialize the client and assert that no PEM markers, certificate field
names, private-key field names, Token, or Sign values appear.

Do not add a second public property that exposes the original config.

**Verify**:

```bash
pnpm --filter facturas test -- src/client.test.ts
pnpm typecheck
```

Expected: tests pass; code that reads safe public config fields compiles; code
cannot type-access credential fields from `client.config`.

### Step 3.2: Bound and redact all transport/parser diagnostics

Create one internal redaction helper and reuse it from HTTP, XML, SOAP, and
logger paths. Requirements:

- Maximum preview length: 4096 characters.
- Redact namespace-qualified and unqualified `Token` and `Sign` XML elements.
- Do not attach full response bodies to public errors.
- Replace `ArcaTransportError.responseBody` with safe
  `responseBodyLength` and `responseBodyPreview` fields.
- Remove unrestricted `parsedDetail` from public invalid-SOAP errors. If a
  structured diagnostic is necessary, make it bounded, recursively redacted,
  and covered by tests; otherwise omit it.
- Logger calls receive scalar safe metadata such as error name, stable code,
  service, operation, status, content type, body length, and redacted preview.
  They do not receive the full Error instance.
- Preserve useful stacks through thrown `cause`; do not serialize causes into
  logger metadata.
- Do not remove the existing structured fiscal issues or successful service
  `raw` result fields in this PR. Their long-term contract is a separate review.

Update all affected error, HTTP, XML, SOAP, and logger tests. Include bodies
larger than the bound and fixtures containing namespaced Token/Sign values.

**Verify**:

```bash
pnpm --filter facturas test -- src/errors.test.ts src/internal/http.test.ts src/internal/xml.test.ts src/soap/index.test.ts src/client.test.ts
```

Expected: all tests pass; previews are bounded and redacted; no logger assertion
receives a full Error object.

### Step 3.3: Add a minor changeset and pass focused gates

Add a minor Changesets entry that names the breaking public diagnostic changes:
credential fields are removed from `client.config`, full transport bodies and
parsed details are removed, and safe bounded metadata replaces them.

**Verify**:

```bash
pnpm fix
pnpm check
pnpm typecheck
pnpm test
git diff --check
```

Expected: all commands exit 0 and only PR 3 scope is modified.

## PR 4: Add deterministic money and high-level Factura B/C builders

### Step 4.1: Introduce stable actionable input errors

Refine `ArcaInputError` without weakening `instanceof ArcaInputError` routing.
Expose typed fields:

- `code`: one stable specific code;
- `field`: dotted/indexed input path when applicable;
- `expected`: a short safe contract description;
- no unrestricted raw caller object.

Define at least these codes and use them consistently:

- `ARCA_INPUT_INVALID_DATE`
- `ARCA_INPUT_INVALID_AMOUNT`
- `ARCA_INPUT_AMOUNT_PRECISION`
- `ARCA_INPUT_AMOUNT_MISMATCH`
- `ARCA_INPUT_INVALID_EXCHANGE_RATE`
- `ARCA_INPUT_MISSING_FIELD`
- `ARCA_INPUT_RESERVED_FIELD`

Migrate existing date, exchange-rate, and WSMTXCA reserved-key errors. Add
tests for exact codes and field paths. Do not place document numbers or other
customer data in error messages when the field name is sufficient.

**Verify**:

```bash
pnpm --filter facturas test -- src/errors.test.ts src/services/wsfe.test.ts src/services/wsmtxca.test.ts
```

Expected: all tests pass and every tested local validation has a stable code and
field.

### Step 4.2: Add a deterministic ARCA decimal layer

Create an internal decimal module with focused unit tests. Do not add a general
decimal dependency unless the BigInt approach below cannot satisfy the tests.

The module must:

1. Validate finite, non-negative exact-input money numbers.
2. Accept harmless IEEE-754 representation noise near a 2-decimal value, but
   reject materially greater precision instead of silently rounding it.
3. Serialize all ARCA amount fields as canonical strings with exactly two
   decimal places.
4. Validate and serialize exchange rates with up to six decimal places as
   canonical decimal strings.
5. Convert builder minor-unit safe integers to canonical 2-decimal strings.
6. Compute supported VAT amounts from minor units with BigInt basis-point math
   and an explicitly tested half-up rule. Never compute VAT with a binary
   floating expression such as `net * 0.21`.
7. Reject values that would exceed JavaScript safe-integer or ARCA field limits.

Add tests for:

- `0.1 + 0.2` normalization where it represents an intended 0.30 exact field;
- `1234.56` preservation;
- `259.2576` rejection as excess money precision;
- negative, `NaN`, positive infinity, and unsafe integers;
- 0%, 2.5%, 5%, 10.5%, 21%, and 27% VAT calculation;
- half-cent boundaries;
- exchange rates at zero, six decimals, and seven decimals.

**Verify**:

```bash
pnpm --filter facturas test -- src/internal/decimal.test.ts
```

Expected: all decimal tests pass without locale-dependent formatting.

### Step 4.3: Validate and serialize the exact WSFE input

Integrate the decimal module into `packages/arca/src/services/wsfe.ts` before
authentication or SOAP work:

- make `receiverVatConditionId` required on authorization input in v0.7.0;
- validate all amount fields as finite and non-negative;
- validate total decomposition against ARCA's documented tolerance;
- validate `vatAmount` against the sum of `vatRates[].amount`;
- validate `netAmount` against VAT base totals when VAT details are present;
- validate each tax amount/base/rate and the sum against `taxAmount`;
- enforce stable field paths such as `vatRates[0].amount`;
- serialize amount and exchange-rate fields through the canonical decimal
  module, never through implicit `String(number)`;
- preserve current date normalization and the `YYYY-MM-DD` / `YYYYMMDD`
  runtime contract;
- preserve zero authorization transport retries.

Use the current ARCA tolerance rules already recorded in the provider manual:
relative error no more than 0.01%, or the documented absolute cent allowance.
Do not invent stricter equality where ARCA explicitly accepts a tolerance.

Expand WSFE tests with mapped SOAP assertions and no-auth/no-SOAP assertions for
local rejection.

**Verify**:

```bash
pnpm --filter facturas test -- src/services/wsfe.test.ts
```

Expected: all WSFE tests pass; invalid amounts fail before auth; valid outgoing
SOAP fields are canonical decimal strings; authorization still has retries 0.

### Step 4.4: Add separate pure Factura B and Factura C builders

Create `packages/arca/src/services/wsfe-builders.ts` and a colocated test.
Export the builders and types from `facturas` and `facturas/wsfe`.

The public contract is:

```ts
const facturaB = buildFacturaB({
  salesPoint: 1,
  concept: ARCA_CONCEPT_TYPES.PRODUCTOS,
  documentType: ARCA_DOCUMENT_TYPES.CONSUMIDOR_FINAL,
  documentNumber: 0,
  receiverVatConditionId: ARCA_RECEIVER_VAT_CONDITIONS.CONSUMIDOR_FINAL,
  voucherDate: "2026-09-02",
  taxableAmount: 10_000, // integer ISO minor units: ARS 100.00
  vatRate: 21,
  // currency omitted: defaults to ISO "ARS"
});

const facturaC = buildFacturaC({
  salesPoint: 1,
  concept: ARCA_CONCEPT_TYPES.PRODUCTOS,
  documentType: ARCA_DOCUMENT_TYPES.CONSUMIDOR_FINAL,
  documentNumber: 0,
  receiverVatConditionId: ARCA_RECEIVER_VAT_CONDITIONS.CONSUMIDOR_FINAL,
  voucherDate: "2026-09-02",
  amount: 10_000, // integer ISO minor units: ARS 100.00
});
```

Builder requirements:

- `currency` is optional and defaults to ISO `ARS`.
- Supported ISO input is `ARS | USD`. Do not claim all ISO currencies.
- Map `ARS -> PES` and `USD -> DOL` only inside the built exact request.
- `ARS` rejects an exchange rate and normalizes exact output to rate `1`.
- `USD` requires an exchange-rate decimal string unless
  same-currency foreign cancellation is true. Model this as a discriminated
  union so invalid combinations fail typecheck.
- `taxableAmount` and `amount` must be non-negative safe integers.
- Factura B derives voucher type `6`, net amount, VAT detail, VAT total, all
  required zero fields, and total. Supported `vatRate` values are the six rates
  in the constants table.
- Factura C derives voucher type `11`, total and net/subtotal semantics required
  by ARCA, zero non-taxable/exempt/tax/VAT fields, and no VAT array.
- Builders are pure: no client, auth, network, date clock, sequence lookup, or
  persistence.
- Advanced exemptions, non-taxable amounts, tributes, multiple VAT rates,
  credit/debit notes, and uncommon currencies remain on `WsfeVoucherInput`.
- Return a value accepted directly as `data` by `authorizeVoucherOutcome()`,
  `authorizeVoucher()`, and `createNextVoucher()`.

Add tests for default ARS, explicit USD, invalid currency combinations, every
VAT rate, cent rounding boundaries, zero amounts, Factura C no-VAT structure,
and immutability/no mutation of caller objects.

**Verify**:

```bash
pnpm --filter facturas test -- src/services/wsfe-builders.test.ts src/services/wsfe.test.ts src/barrels.test.ts
pnpm typecheck
```

Expected: all tests pass and both documented import paths compile.

### Step 4.5: Clarify ISO versus ARCA constants without breaking old imports

Add:

```ts
ISO_CURRENCIES = { ARS: "ARS", USD: "USD" }
ARCA_CURRENCY_IDS = { ARS: "PES", USD: "DOL" }
```

Use ISO constants only in builder documentation. Keep `ARCA_CURRENCIES` as a
deprecated compatibility alias through at least 1.0; do not silently change its
values. Document that `getCurrencyTypes()` returns live ARCA IDs, not ISO codes.

**Verify**:

```bash
pnpm --filter facturas test -- src/constants.test.ts src/barrels.test.ts
pnpm typecheck:examples
```

Expected: old constants still work and new ISO/builder imports compile.

### Step 4.6: Rewrite the primary DX path and add a minor changeset

Rewrite the README quick start to use `buildFacturaB()`. It must show:

- amount input in integer minor units;
- omitted currency defaulting to `ARS`;
- required receiver VAT condition;
- no caller-computed VAT or total;
- `createNextVoucher()` labeled as single-writer convenience;
- `authorizeVoucherOutcome()` plus caller-owned exact voucher number as the
  durable-service path;
- the exact `WsfeVoucherInput` API as the advanced escape hatch;
- `USD` with a decimal-string exchange rate in a separate example;
- a note that ARCA IDs remain visible in exact inputs and catalog responses.

Update all examples to match the v0.7 types. Add a minor changeset that lists
the required receiver VAT condition, canonical decimal serialization, stable
input errors, new builders, ISO/default currency behavior, and deprecated old
currency constants.

**Verify**:

```bash
pnpm typecheck:examples
pnpm --filter facturas check:exports
pnpm pack:check
```

Expected: examples and documented imports compile from built declarations and
the package dry-run contains the expected README and entrypoints.

## PR 5: Classify authentication failures and add only proven-safe recovery

### Step 5.1: Add a typed authentication error contract

Add and export `ArcaAuthenticationError` plus a narrow predicate if useful to
consumers. Include safe structured fields:

- stable code `ARCA_AUTHENTICATION_ERROR`;
- reason union such as `invalid_token`, `unauthorized_computer`,
  `missing_relationship`, or `authentication_rejected`;
- service and operation;
- safe provider fault/service code when available.

Centralize classification. Prefer structured SOAP fault or service codes. When
ARCA supplies only text, normalize only the known authentication phrases now
handled by consumers, including `computador no autorizado`,
`no autorizado a acceder al servicio`, `ValidacionDeToken`, and
`No aparecio CUIT en lista de relaciones`, including accent variants. Do not
classify arbitrary transport messages, serialized object graphs, or partial
words as authentication failures.

Add table-driven tests for positives and near-miss negatives. Ensure error
metadata follows the PR 3 redaction contract.

**Verify**:

```bash
pnpm --filter facturas test -- src/errors.test.ts src/services/wsfe.test.ts src/services/wsmtxca.test.ts
```

Expected: known explicit auth rejections become typed errors and near misses do
not.

### Step 5.2: Add one safe refresh retry to convenience operations only

Implement a shared internal operation helper with these rules:

1. Read/catalog/lookup convenience operations may retry once with
   `forceRefresh: true` only after a typed explicit authentication rejection.
2. `authorizeVoucher()` and `createNextVoucher()` may retry the exact same
   authorization payload and voucher number once only after a typed explicit
   authentication rejection. `createNextVoucher()` must not fetch another
   number for the retry.
3. WSMTXCA `authorizeVoucher()` follows the same rule with the same payload.
4. `authorizeVoucherOutcome()` in both services never uses the helper's retry
   mode. It remains one exact authorization attempt and records the typed
   authentication evidence in its indeterminate reason/details.
5. If the caller already set `forceRefresh: true`, do not perform another
   refresh retry.
6. Never retry `ArcaTransportError`, timeout, connection close, invalid SOAP,
   incomplete or contradictory authorization evidence, or a generic service
   rejection.
7. Authorization transport retries remain hard-coded to zero on each exact
   SOAP attempt.

Add tests that assert exact auth and SOAP call counts for every allowed and
forbidden case. Include a `createNextVoucher()` test that proves the second
authorization uses the number obtained before the explicit auth rejection.

**Verify**:

```bash
pnpm --filter facturas test -- src/services/wsfe.test.ts src/services/wsmtxca.test.ts
```

Expected: explicit auth rejection causes exactly one forced recovery in
convenience methods; exact outcome methods and indeterminate failures make one
authorization SOAP attempt only.

### Step 5.3: Strengthen the built-package consumer contract

Extend `packages/arca/scripts/check-package-exports.mjs` and add a TypeScript
consumer fixture that resolves the built package through its declared exports,
not `tsconfig.examples.json` source aliases. The fixture must compile:

- `createArcaClient`;
- `buildFacturaB` and `buildFacturaC` from both intended entrypoints;
- ISO and ARCA currency constants;
- stable input and authentication errors;
- exact WSFE authorization types.

The runtime script must assert the new runtime exports exist. Keep the script
network-free and deterministic.

**Verify**:

```bash
pnpm --filter facturas check:exports
pnpm pack:check
```

Expected: built runtime imports resolve, the built declaration consumer
compiles, and package contents are correct.

### Step 5.4: Finish documentation and add the final v0.7 changeset

Document:

- the error reason fields and safe metadata;
- which convenience operations perform one explicit-auth-rejection recovery;
- the exact one-attempt guarantee of both authorization outcome methods;
- why timeouts and other indeterminate outcomes are never retried;
- the single-writer limit of `createNextVoucher()`;
- migration examples from decimal amount inputs and `PES`/`DOL` application
  values to builder minor units and ISO `ARS`/`USD`;
- that exact inputs and provider catalog results still use ARCA IDs.

Add a minor or patch changeset as appropriate. Changesets will aggregate all
v0.7 entries to one minor release. Do not edit version or changelog manually.

**Verify**:

```bash
pnpm fix
pnpm check
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm --filter facturas check:exports
pnpm pack:check
pnpm audit --prod
git diff --check
```

Expected: every command exits 0 and only PR 5 scope is modified.

## Test plan summary

The implementation must add or extend tests for:

- release workflow SHA guard, verified by hosted workflow behavior;
- encrypted-key rejection before WSAA;
- mixed ordinary/forced WSAA concurrency, including rejection and multiple
  forced waiters;
- WSMTXCA reserved authentication key rejection and trusted precedence;
- peso exchange-rate default and foreign-currency discriminants;
- all added voucher, document, VAT, receiver-condition, ISO, and ARCA constants;
- public client serialization with no credential material;
- bounded/redacted transport, XML, SOAP, and logger diagnostics;
- stable input error codes and field paths;
- decimal noise, excess precision, totals, VAT/tax reconciliation, limits, and
  exchange-rate scale;
- pure Factura B and C builders across every supported VAT/currency path;
- typed authentication positives and near-miss negatives;
- safe convenience recovery and exact outcome non-retry behavior;
- built runtime and TypeScript consumer exports;
- all examples under strict TypeScript.

Use existing colocated Vitest files as the structural pattern. Avoid real ARCA
network calls in automated tests.

## Optional homologation acceptance gate

This gate requires maintainer-provided homologation credentials and explicit
authorization. It is not an automated executor step and must never use
production:

1. Build the exact README Factura B request with an allowed current Argentine
   date, a homologation point of sale, document data allowed for that amount,
   and receiver VAT condition.
2. Authorize once in homologation.
3. Confirm the response has CAE, expiry, and the requested voucher number.
4. Query the same voucher and confirm currency, totals, VAT, receiver condition,
   and CAE match.
5. Record only redacted evidence. Never store or paste PEM, Token, or Sign.

If credentials or an authorized point of sale are unavailable, mark this gate
`NOT RUN`; do not claim live CAE proof. Fixture and contract tests remain
mandatory.

## Program done criteria

All criteria must hold:

- [ ] PR 1 prevents publishing any commit other than the successful CI SHA.
- [ ] Hosted CI is green on Node 20, 22, and 24 and enforces every contract gate.
- [ ] v0.6.1 fixes encrypted keys, forced-refresh concurrency, WSMTXCA auth
      precedence, peso default rate, constants, and examples without breaking
      existing exact inputs.
- [ ] Public client serialization cannot expose PEM material.
- [ ] Public errors and logger metadata contain only bounded, redacted provider
      diagnostics.
- [ ] Exact WSFE amount mapping is deterministic and locally reconciled.
- [ ] `buildFacturaB()` and `buildFacturaC()` accept integer minor-unit amounts,
      use ISO currency input, and default currency to `ARS`.
- [ ] Exact WSFE input keeps ARCA currency IDs as an explicit provider boundary.
- [ ] `authorizeVoucherOutcome()` performs one exact authorization attempt and
      has tests that prevent regression.
- [ ] Only explicit authentication rejection can trigger one safe convenience
      retry; all indeterminate outcomes have no automatic retry.
- [ ] `createNextVoucher()` remains available and is labeled single-writer.
- [ ] README, package README, examples, declarations, runtime exports, and packed
      contents agree.
- [ ] Every Changesets entry is present; package versions and changelogs were not
      edited manually by implementation PRs.
- [ ] Final commands all exit 0:

```bash
pnpm fix
pnpm check
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm --filter facturas check:exports
pnpm pack:check
pnpm audit --prod
git diff --check
```

- [ ] `git status --short` contains no unrelated files.
- [ ] `plans/README.md` status is updated after each milestone and set to `DONE`
      only after all implementation gates pass. Release publication may remain a
      separately recorded maintainer gate.

## STOP conditions

Stop and report without improvising if:

- implementation is not based on the latest `origin/main` or an in-scope file
  materially differs from the Current state excerpts;
- baseline tests, typecheck, lint, exports, or pack check fail before changes;
- the release fix cannot keep a `main` branch checkout while proving the tested
  SHA;
- supporting encrypted private keys would require passphrase handling;
- the forced-refresh solution can issue two simultaneous WSAA logins for one
  local session key;
- current official ARCA documentation contradicts any currency mapping, VAT
  rate ID, receiver-condition ID, amount scale, tolerance, or Factura C rule in
  this plan;
- a new builder needs exemptions, multiple VAT rates, tributes, credit/debit
  notes, or a currency other than ARS/USD to satisfy its first public contract;
- deterministic decimal behavior would require silently rounding materially
  over-precise exact input;
- authentication rejection cannot be distinguished positively from transport
  or indeterminate failure evidence;
- a safe authentication retry would require fetching a new voucher number or
  changing the exact payload;
- any step requires a La Pyme schema/domain migration, live production call,
  package publication, release-PR merge, or file outside Scope;
- a focused or full verification command fails twice after a reasonable fix;
- formatter output touches files outside Scope. Do not revert it automatically;
  report the expanded diff and wait for direction.

## Maintenance notes

- Reviewers must inspect fiscal retry call counts, not only returned values.
- Reviewers must inspect outgoing XML strings for canonical scales and ensure
  no new implicit `String(number)` money path exists.
- Keep the ISO-to-ARCA mapping small and explicit. Adding another ISO currency
  requires current catalog evidence, scale rules, quotation behavior, and tests.
- High-level builders are intentionally narrow. Add more builders only from
  demonstrated consumer demand; keep the exact input as the advanced path.
- When `createNextVoucher()` is used by a multi-worker service, the caller still
  owns one fiscal lane, exact request persistence, and lookup-before-resubmit
  recovery.
- A future review should decide the low-level factory surface, type WSMTXCA
  requests, add sanitized real SOAP fixtures, and revisit successful `raw`
  provider data. Those tasks must not delay this bounded program.

