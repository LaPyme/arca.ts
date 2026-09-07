import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import packageJson from "../../package.json" with { type: "json" };
import { createDefaultIo, run } from "./main";
import {
  type CliIo,
  type CliOutputStream,
  createWriter,
  shouldUseColor,
} from "./output";
import { readCliVersion } from "./version";

describe("run --help and --version", () => {
  it("prints the root help on stdout and exits 0", async () => {
    const context = createContext();

    expect(await run(["--help"], context.io)).toBe(0);
    expect(context.stdout()).toContain(`facturas ${packageJson.version}`);
    expect(context.stdout()).toContain("npx facturas <comando> [opciones]");
    expect(context.stderr()).toBe("");
  });

  it("accepts -h as an alias", async () => {
    const context = createContext();

    expect(await run(["-h"], context.io)).toBe(0);
    expect(context.stdout()).toContain("Comandos:");
  });

  it("prints one command's help for its --help", async () => {
    const context = createContext();

    expect(await run(["check", "--help"], context.io)).toBe(0);
    expect(context.stdout()).toContain("npx facturas check [opciones]");
    expect(context.stdout()).toContain("--sales-point <n>");
    expect(context.stdout()).not.toContain("Comandos:");
  });

  it("keeps a command's --help away from ARCA and the prompt", async () => {
    for (const command of ["init", "check", "issue"]) {
      const context = createContext();
      const createClient = vi.fn();
      const createAuth = vi.fn();
      const io = { ...context.io, createClient, createAuth } as CliIo;

      expect(await run([command, "--help"], io)).toBe(0);
      expect(context.stdout()).toContain(`npx facturas ${command} [opciones]`);
      expect(context.stderr()).toBe("");
      expect(createClient).not.toHaveBeenCalled();
      expect(createAuth).not.toHaveBeenCalled();
    }
  });

  it("moves what it stores into the command that stores it", async () => {
    const context = createContext();

    await run(["check", "--help"], context.io);

    expect(context.stdout()).toContain("Nunca escribe en ARCA: solo lee.");
    expect(context.stdout()).toContain("--no-cache no lo lee ni lo escribe.");
  });

  it("says that issue writes a real voucher, in issue's help", async () => {
    const context = createContext();

    await run(["issue", "--help"], context.io);

    expect(context.stdout()).toContain(
      "Emite un comprobante real de homologación"
    );
  });

  it("prints the published version", async () => {
    const context = createContext();

    expect(await run(["--version"], context.io)).toBe(0);
    expect(context.stdout()).toBe(`${packageJson.version}\n`);
  });

  it("accepts -v as an alias, even after a command", async () => {
    const context = createContext();

    expect(await run(["check", "-v"], context.io)).toBe(0);
    expect(context.stdout()).toBe(`${packageJson.version}\n`);
  });

  it("reads the version from the nearest package.json", () => {
    expect(readCliVersion()).toBe(packageJson.version);
  });

  it("prints the root help on stderr and exits 2 with no command", async () => {
    const context = createContext();

    expect(await run([], context.io)).toBe(2);
    expect(context.stderr()).toContain("npx facturas <comando> [opciones]");
    expect(context.stdout()).toBe("");
  });
});

describe("run dispatch", () => {
  it("exits 2 for a command it does not have", async () => {
    const context = createContext();

    expect(await run(["frobnicate"], context.io)).toBe(2);
    expect(context.stderr()).toContain("Comando desconocido: frobnicate");
  });

  it("exits 2 for a flag it does not have, in castellano", async () => {
    const context = createContext();

    expect(await run(["check", "--nope"], context.io)).toBe(2);
    expect(context.stderr()).toContain("Opción desconocida: --nope");
    expect(context.stderr()).toContain("npx facturas check [opciones]");
  });

  it("exits 2 when a flag is missing its value", async () => {
    const context = createContext();

    expect(await run(["check", "--tax-id"], context.io)).toBe(2);
    expect(context.stderr()).toContain("Falta el valor de");
  });

  it("exits 2 for a --sales-point that is not a positive integer", async () => {
    const context = createContext();

    expect(await run(["check", "--sales-point", "tres"], context.io)).toBe(2);
    expect(context.stderr()).toContain(
      "--sales-point espera un número entero positivo."
    );
  });

  it("routes check and returns its exit code", async () => {
    const context = createContext();

    expect(await run(["check"], context.io)).toBe(1);
    expect(context.stdout()).toContain("Falta el CUIT.");
  });

  it("routes issue and refuses outside homologación", async () => {
    const context = createContext({ ARCA_ENVIRONMENT: "production" });

    expect(await run(["issue"], context.io)).toBe(1);
    expect(context.stderr()).toContain("issue solo emite en homologación.");
  });

  it("routes init and asks for the CUIT it was not given", async () => {
    const context = createContext();

    expect(await run(["init"], context.io)).toBe(2);
    expect(context.stderr()).toContain("Falta el CUIT.");
  });
});

describe("color guard", () => {
  it("paints only on a TTY", () => {
    expect(shouldUseColor({ write: () => undefined, isTTY: true }, {})).toBe(
      true
    );
    expect(shouldUseColor({ write: () => undefined }, {})).toBe(false);
  });

  it("obeys NO_COLOR even on a TTY", () => {
    expect(
      shouldUseColor({ write: () => undefined, isTTY: true }, { NO_COLOR: "1" })
    ).toBe(false);
    expect(
      shouldUseColor({ write: () => undefined, isTTY: true }, { NO_COLOR: "" })
    ).toBe(false);
  });

  it("obeys --no-color even on a TTY", () => {
    expect(
      shouldUseColor({ write: () => undefined, isTTY: true }, {}, true)
    ).toBe(false);
  });

  it("paints without a TTY when FORCE_COLOR asks for it", () => {
    expect(
      shouldUseColor({ write: () => undefined }, { FORCE_COLOR: "1" })
    ).toBe(true);
    expect(
      shouldUseColor({ write: () => undefined }, { FORCE_COLOR: "0" })
    ).toBe(false);
    expect(
      shouldUseColor(
        { write: () => undefined },
        { FORCE_COLOR: "1", NO_COLOR: "1" }
      )
    ).toBe(false);
  });

  it("puts ANSI on the mark and nowhere else", () => {
    const lines: string[] = [];
    const writer = createWriter(
      { write: (chunk) => lines.push(chunk) },
      { color: true }
    );

    writer.ok("WSAA", "ticket obtenido");
    writer.fail("WSFE");
    writer.warn("puntos de venta", "ninguno");

    expect(lines[0]).toBe(
      "\u001B[32m✓\u001B[0m WSAA                   ticket obtenido\n"
    );
    expect(lines[1]).toBe("\u001B[31m✗\u001B[0m WSFE\n");
    expect(lines[2]).toBe(
      "\u001B[33m!\u001B[0m puntos de venta        ninguno\n"
    );
  });

  it("writes no ANSI at all when color is off", async () => {
    const context = createContext({ NO_COLOR: "1" }, true);

    await run(["check"], context.io);

    // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting no ANSI
    expect(context.stdout()).not.toMatch(/\u001B\[/);
  });
});

describe("createDefaultIo", () => {
  it("wires the real process and the real SDK", () => {
    const io = createDefaultIo();

    expect(io.stdout).toBe(process.stdout);
    expect(io.stderr).toBe(process.stderr);
    expect(io.stdin).toBe(process.stdin);
    expect(io.env).toBe(process.env);
    expect(io.now()).toBeInstanceOf(Date);
    expect(() => io.createClient({})).toThrow();
    expect(
      io.createAuth({
        taxId: "20123456786",
        certificatePem: "cert",
        privateKeyPem: "key",
        environment: "test",
      })
    ).toHaveProperty("login");
  });
});

describe("bin/facturas.mjs", () => {
  it("calls main() from the built CLI entry", () => {
    const bin = readFileSync(
      new URL("../../bin/facturas.mjs", import.meta.url),
      "utf8"
    );
    expect(bin).toContain("#!/usr/bin/env node");
    expect(bin).toContain('import { main } from "../dist/cli.mjs";');
    expect(bin).toContain("main(process.argv.slice(2))");
  });
});

function createContext(
  env: Record<string, string | undefined> = {},
  tty = false
) {
  const out: string[] = [];
  const err: string[] = [];
  const stdout: CliOutputStream = {
    write: (chunk) => out.push(chunk),
    ...(tty ? { isTTY: true } : {}),
  };
  const stderr: CliOutputStream = { write: (chunk) => err.push(chunk) };
  const io: CliIo = {
    stdout,
    stderr,
    stdin: new PassThrough(),
    env,
    cwd: tmpdir(),
    cacheDir: tmpdir(),
    now: () => new Date("2026-09-06T00:00:00Z"),
    createClient: () => {
      throw new Error("no client in these tests");
    },
    createAuth: () => {
      throw new Error("no login in these tests");
    },
  };
  return { io, stdout: () => out.join(""), stderr: () => err.join("") };
}
