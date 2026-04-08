import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    errors: "src/errors.ts",
    padron: "src/padron.ts",
    types: "src/types.ts",
    wsfe: "src/wsfe.ts",
    wsmtxca: "src/wsmtxca.ts",
  },
  target: "node20",
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  skipNodeModulesBundle: true,
  outDir: "dist",
});
