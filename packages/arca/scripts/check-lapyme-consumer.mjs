#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = fileURLToPath(new URL("..", import.meta.url));
const consumer = process.argv[2];
if (!consumer) {
  throw new Error(
    "Usage: node packages/arca/scripts/check-lapyme-consumer.mjs /path/to/lapyme"
  );
}
const shared = resolve(consumer, "packages/shared");
const tests = [
  "afip-service.unit.test.ts",
  "afip-voucher-request.unit.test.ts",
  "arca-fiscal-evidence.unit.test.ts",
  "facturas-wsmtxca-serialization.unit.test.ts",
];
for (const test of tests) {
  await access(join(shared, "src", test));
}
const fixture = await mkdtemp(join(tmpdir(), "facturas-lapyme-"));
const run = (cwd, args) => {
  const result = spawnSync("pnpm", args, { cwd, stdio: "inherit" });
  if (result.error || result.status !== 0) {
    throw new Error(`Consumer verification failed: pnpm ${args.join(" ")}`, {
      cause: result.error,
    });
  }
};
const writeJson = (file, value) =>
  writeFile(join(fixture, file), JSON.stringify(value, null, 2));
const { version } = JSON.parse(
  await readFile(join(packageDir, "package.json"), "utf8")
);
run(packageDir, ["pack", "--pack-destination", fixture]);
await writeJson("package.json", {
  name: "facturas-consumer-check",
  private: true,
  type: "module",
});
run(fixture, [
  "add",
  "--ignore-scripts",
  join(fixture, `facturas-${version}.tgz`),
]);
const candidate = join(fixture, "node_modules/facturas/dist");
await writeJson("tsconfig.json", {
  extends: join(shared, "tsconfig.json"),
  compilerOptions: {
    paths: {
      facturas: [join(candidate, "index.d.ts")],
      "facturas/*": [join(candidate, "*")],
    },
    typeRoots: [
      resolve(consumer, "node_modules/@types"),
      join(shared, "node_modules/@types"),
    ],
  },
  include: [
    "afip-service.ts",
    "afip-voucher-request.ts",
    "arca-fiscal-evidence.ts",
  ].map((file) => join(shared, "src", file)),
  exclude: [],
});
await writeFile(
  join(fixture, "vitest.config.mjs"),
  `export default ${JSON.stringify(
    {
      root: shared,
      resolve: {
        alias: [
          { find: "facturas", replacement: join(candidate, "index.mjs") },
        ],
      },
      test: {
        include: tests.map((file) => `src/${file}`),
        environment: "node",
        testTimeout: 30_000,
      },
    },
    null,
    2
  )}`
);
run(shared, [
  "exec",
  "tsc",
  "--project",
  join(fixture, "tsconfig.json"),
  "--noEmit",
]);
run(shared, [
  "exec",
  "vitest",
  "run",
  "--config",
  join(fixture, "vitest.config.mjs"),
]);
console.log(
  `Packaged candidate and verification configuration retained at ${fixture}`
);
