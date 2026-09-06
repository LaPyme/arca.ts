# Contributing

Development commands, from the repository root:

```bash
pnpm install
pnpm typecheck
pnpm typecheck:examples
pnpm test
pnpm test:coverage
pnpm pack:check
```

Optional for local DX: install Turbo globally with `pnpm add --global turbo`.
The repo scripts still use the local workspace version.

## Documentation

The documentation is Spanish-first. `README.md` is the front door,
`docs/` holds one page per topic, and `docs/en/README.md` is a short English
summary. `docs/external/` is a maintainer ledger of the ARCA manual rules the
SDK encodes; it stays in English.

`packages/arca/README.md` is a byte-identical copy of `README.md`. After
editing the root README, run:

```bash
pnpm docs:sync
pnpm check:docs
```

`pnpm check:docs` also verifies that every relative link and heading anchor in
`README.md`, `docs/**/*.md` and `packages/arca/README.md` resolves, and that
every file in `examples/` is linked from at least one document. It runs in CI.
