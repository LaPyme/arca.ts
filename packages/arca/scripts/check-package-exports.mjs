#!/usr/bin/env node
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const entrypoints = [
  [
    "facturas",
    [
      "createArcaClient",
      "buildFacturaB",
      "buildFacturaC",
      "ArcaInputError",
      "ArcaAuthenticationError",
      "isArcaAuthenticationError",
    ],
  ],
  [
    "facturas/constants",
    ["ARCA_VOUCHER_TYPES", "ISO_CURRENCIES", "ARCA_CURRENCY_IDS"],
  ],
  [
    "facturas/errors",
    [
      "ArcaError",
      "ArcaInputError",
      "ArcaAuthenticationError",
      "isArcaAuthenticationError",
    ],
  ],
  ["facturas/padron", ["createPadronService"]],
  ["facturas/types", []],
  ["facturas/wsfe", ["createWsfeService", "buildFacturaB", "buildFacturaC"]],
  ["facturas/wsmtxca", ["createWsmtxcaService"]],
];

for (const [specifier, runtimeExports] of entrypoints) {
  const imported = await import(specifier);

  for (const runtimeExport of runtimeExports) {
    if (!(runtimeExport in imported)) {
      throw new Error(
        `Expected ${specifier} ESM import to expose ${runtimeExport}.`
      );
    }
  }

  try {
    const required = require(specifier);

    for (const runtimeExport of runtimeExports) {
      if (!(runtimeExport in required)) {
        throw new Error(
          `Expected ${specifier} require() to expose ${runtimeExport}.`
        );
      }
    }
  } catch (error) {
    if (
      error?.code !== "ERR_REQUIRE_ESM" &&
      error?.code !== "ERR_REQUIRE_ASYNC_MODULE"
    ) {
      throw error;
    }
  }
}

console.log("Package runtime exports resolve as ESM-only entrypoints.");
