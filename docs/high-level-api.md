# Issuing invoices and notes

The high-level API handles the fiscal derivation, provider encoding, number
reservation and consultation evidence for WSFE and WSMTXCA CAE issuance.
It covers La Pyme's normal fiscal document families without depending on its
application or database. Padrón and the exact service modules remain available.

## Coverage

| Need | Input or method |
| --- | --- |
| Ordinary A/B/C invoices | `issue({ issuer, to, items, salesPoint })` |
| A con leyenda | `family: "retention_legend"` (A only; 51/52/53) |
| FCE | `family: "fce"`, `dueDate`, `fce` bank/transfer fields |
| Tributes and perceptions | `taxes: [{ id, description, base, rate, amount }]` |
| Reviewed fiscal amounts | `amounts: { net, vat, exempt, untaxed, vatRates }` **instead of** `items` |
| Receiver catalog conditions | Numeric `to.condition` with `cuit`, `dni`, or `document: { type, number }` |
| Mixed products/services | `concept: "products_and_services"` and `service: { from, to, dueDate }` |
| Foreign-currency payment | `currency: "USD"`, `exchangeRate`, `paidInForeignCurrency` |
| Other currencies | `currency: { id: "060" }` and an explicit decimal-string rate; ARCA checks eligibility |
| Credit note against invoice or debit note | `issueCreditNote({ for, items })` or `{ for, all: true }` |
| Debit note | `issueDebitNote({ for, items })` |
| Reviewed partial note | `amounts` instead of `items` on a linked note |
| Period note | Invoice business input plus `associatedPeriod: { from, to }` to either note method |
| Invoice preview | Synchronous `preview(input, { service })`; zero I/O |
| Note preview | Async `previewCreditNote` / `previewDebitNote`; consultation only for linked notes |
| Detailed WSMTXCA | `details` plus `{ service: "wsmtxca" }` in the second argument |
| Existing ledger reservation | `number` in issuance options; skips next-number allocation |
| Read-only reconciliation | `recover(idempotencyKey, options)`; never authorizes, even after `not_found` |

`for` identifies one authorized invoice or debit note, using only
`{ salesPoint, voucherType, number }`. Pass those three coordinates from a
previous result; do not pass the whole result object. Linked notes inherit
class, receiver, currency and service dates. Notes against periods instead
require explicit invoice business inputs. FCE notes require a linked original.

Credit notes retain the safety limit that one note cannot exceed its original.
Cumulative refunds, remaining balances, stock, accounting, tax-agent eligibility
and deciding which perceptions apply remain application responsibilities. A
full credit note is a new fiscal document, not deletion of the original.

## Reviewed money

Amounts, tax bases and tax amounts are integer minor units (cents). Percentages
such as `rate: 3` are percentages. Computed `items` use the existing grouped VAT
rounding. `amounts` takes an already-reviewed breakdown and does not recompute
VAT. Its `vatRates` rows use `{ id, base, amount }`, also in cents. An optional
`total` preserves the reviewed total and is checked against the exact provider
amount reconciliation rules; it is not silently rewritten.

`items` and `amounts` are mutually exclusive. Tributes are separate from either
mode and contribute to the total. Full notes mirror the original tax amounts;
partial notes require the caller's chosen tax amounts. No proportional tax
policy is guessed. Generic WSFE `optionalFields`, `buyers` and `activities` are
also supported; note-specific optional fields must be supplied for the new note
rather than copied from the original invoice.

## FCE across providers

Use `fce: { cbu, alias?, transfer?, reference? }` on FCE invoices and
`fce: { annulment: false | true, reference? }` on FCE notes. The annulment flag
is explicit; `all: true` does not choose it. Invoices require a due date and a
22-digit CBU. ARCA validates the actual bank account and issuer eligibility.

The SDK encodes CBU/alias as WSFE options 2101/2102 and as the combined WSMTXCA
additional-data entry 21. Annulment uses entry 22. Transfer uses 27. The issuer
CUIT and original date are included on FCE note associations. Do not duplicate
these entries through `optionalFields` when also using `fce`.

## Detailed WSMTXCA

Select the provider explicitly in the second argument. The SDK never switches
providers after a rejection or timeout. Each `details` entry describes a
provider item: `description`, `quantity`, `unit`, `unitPrice`, `vatCondition`,
`vatAmount` when applicable, and `amount`, with optional `discount`, `code`,
`matrixCode` and `matrixUnits`. The detail totals must reconcile with the fiscal
header excluding tributes. WSMTXCA item amounts include VAT; an A item normally
also reports its VAT amount explicitly.

`unitPrice` is the one monetary exception: a **major-unit decimal string** with
up to six decimals, preserving the provider's unit-price precision. All other
monetary detail fields are integer cents. Fiscal aggregates come from the same
`items` or reviewed `amounts` input as WSFE. The SDK handles both provider
encodings; applications do not build SOAP arrays.

`preview(input, { service: "wsmtxca" }).request` is the WSMTXCA request without
a voucher number. `include: { exactInput: true }` returns the actual submitted
WSMTXCA request as `sent` on authorization. WSFE callers keep their existing
`WsfeVoucherInput` request/sent types. The return types follow literal service
options. See [compiled examples](../examples/complete-issuance.ts).

## Durable recovery

Configure a durable `ArcaStore` and use a stable key for each logical document.
The reservation is persisted before authorization and contains the provider,
number and fiscal input. Existing WSFE version-1 records remain readable.
Changing the input, operation, provider or explicit number with the same key is
an idempotency mismatch. Preserve reservations indefinitely.

An external ledger can pass its reserved `number`. This prevents a second
allocator from choosing a different number. The application must still own the
physical fiscal sequence across workers and other systems; distinct keys do not
create a distributed sequence lock.

Repeating `issue` or a note method first consults its reservation. Only confirmed
absence permits one authorization of that same number. A mismatch is a conflict;
incomplete or failed consultation remains uncertain. `recover(key)` uses the
stored provider and only consults: even confirmed absence produces an
`indeterminate` result, with no write. Source-invoice lookup is not repeated on
keyed note replay.

Matching includes header identity, amounts, VAT, tributes, associations (including
provided issuer/date), optional fields, buyers, activities and currency payment
flags. WSMTXCA additionally compares complete detailed wire evidence. Missing
fields never become fabricated proof of a match. Raw provider data is excluded
unless requested.

## Validation boundary

This change covers CAE invoice/note workflows, not new CAEA, export or other
ARCA services. Deterministic tests run without fiscal writes. Live homologation,
package publication and application deployment are separate rollout steps.
