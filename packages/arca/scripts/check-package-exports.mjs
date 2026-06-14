#!/usr/bin/env node
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const entrypoints = [
  ["facturas", "createArcaClient"],
  ["facturas/constants", "ARCA_VOUCHER_TYPES"],
  ["facturas/errors", "ArcaError"],
  ["facturas/padron", "createPadronService"],
  ["facturas/types", null],
  ["facturas/wsfe", "createWsfeService"],
  ["facturas/wsmtxca", "createWsmtxcaService"],
];

for (const [specifier, runtimeExport] of entrypoints) {
  const imported = await import(specifier);

  if (runtimeExport && !(runtimeExport in imported)) {
    throw new Error(
      `Expected ${specifier} ESM import to expose ${runtimeExport}.`
    );
  }

  try {
    const required = require(specifier);

    if (runtimeExport && !(runtimeExport in required)) {
      throw new Error(
        `Expected ${specifier} require() to expose ${runtimeExport}.`
      );
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

console.log("Package exports resolve as ESM-only entrypoints.");
