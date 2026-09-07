import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { runInit } from "./init";
import { type CliIo, type CliOutputStream, createWriter } from "./output";

const created: string[] = [];

afterEach(() => {
  for (const directory of created.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("runInit", () => {
  it("writes the key and the CSR and prints the ARCA steps", async () => {
    const { io, stdout, directory } = createTestIo();

    const code = await runInit(
      io,
      { cuit: "20123456789", env: "test", dir: directory },
      createWriter(io.stdout, { color: false })
    );

    expect(code).toBe(0);
    expect(readFileSync(join(directory, "arca-test.key"), "utf8")).toContain(
      "-----BEGIN PRIVATE KEY-----"
    );
    expect(readFileSync(join(directory, "arca-test.csr"), "utf8")).toContain(
      "-----BEGIN CERTIFICATE REQUEST-----"
    );
    expect(stdout()).toMatchInlineSnapshot(`
      "✓ arca-test.key          clave privada RSA 2048, permisos 0600
      ✓ arca-test.csr          CSR para ARCA, CN=facturas

      Listo. Ahora en ARCA:

        1. Entrá con clave fiscal a https://auth.afip.gob.ar/contribuyente_/login.xhtml
        2. Homologación: en Mis Servicios, WSASS - Autogestión Certificados Homologación → Nuevo Certificado.
           Producción: Administración de Certificados Digitales → Agregar alias.
           Alias: facturas-test
           Pegá el contenido de arca-test.csr
        3. Descargá el certificado y guardalo como arca-test.crt
        4. Homologación: en el mismo WSASS, Crear autorización a servicio → wsfe.
           Producción: Administrador de Relaciones → Nueva Relación → WebServices → Facturación Electrónica,
           con el alias facturas-test.

      Cuando tengas el certificado:

        export ARCA_TAX_ID=20123456789
        export ARCA_ENVIRONMENT=test
        export ARCA_CERTIFICATE_PEM="$(cat arca-test.crt)"
        export ARCA_PRIVATE_KEY_PEM="$(cat arca-test.key)"
        npx facturas check
      "
    `);
  });

  it.runIf(process.platform !== "win32")(
    "writes the private key with mode 0600",
    async () => {
      const { io, directory } = createTestIo();

      await runInit(
        io,
        { cuit: "20123456789", env: "test", dir: directory },
        createWriter(io.stdout, { color: false })
      );

      // biome-ignore lint/suspicious/noBitwiseOperators: POSIX modes are bit flags
      const mode = statSync(join(directory, "arca-test.key")).mode & 0o777;
      expect(mode.toString(8)).toBe("600");
    }
  );

  it("names the files after the environment", async () => {
    const { io, directory } = createTestIo();

    await runInit(
      io,
      { cuit: "20123456789", env: "production", dir: directory },
      createWriter(io.stdout, { color: false })
    );

    expect(
      readFileSync(join(directory, "arca-production.key"), "utf8")
    ).toContain("PRIVATE KEY");
  });

  it("refuses to overwrite an existing file", async () => {
    const { io, directory, stderr } = createTestIo();
    writeFileSync(join(directory, "arca-test.key"), "no me pises");

    const code = await runInit(
      io,
      { cuit: "20123456789", env: "test", dir: directory },
      createWriter(io.stdout, { color: false })
    );

    expect(code).toBe(1);
    expect(stderr()).toContain("Usá --force para sobrescribir.");
    expect(readFileSync(join(directory, "arca-test.key"), "utf8")).toBe(
      "no me pises"
    );
  });

  it("overwrites with --force", async () => {
    const { io, directory } = createTestIo();
    writeFileSync(join(directory, "arca-test.key"), "no me pises");

    const code = await runInit(
      io,
      { cuit: "20123456789", env: "test", dir: directory, force: true },
      createWriter(io.stdout, { color: false })
    );

    expect(code).toBe(0);
    expect(readFileSync(join(directory, "arca-test.key"), "utf8")).toContain(
      "PRIVATE KEY"
    );
  });

  it("appends the credential patterns to an existing .gitignore, once", async () => {
    const { io, directory, stdout } = createTestIo();
    writeFileSync(join(directory, ".gitignore"), "node_modules\n");

    await runInit(
      io,
      { cuit: "20123456789", env: "test", dir: directory },
      createWriter(io.stdout, { color: false })
    );
    expect(readFileSync(join(directory, ".gitignore"), "utf8")).toBe(
      "node_modules\narca-*.key\narca-*.crt\n"
    );
    expect(stdout()).toContain("agregué arca-*.key y arca-*.crt");

    await runInit(
      io,
      { cuit: "20123456789", env: "test", dir: directory, force: true },
      createWriter(io.stdout, { color: false })
    );
    expect(readFileSync(join(directory, ".gitignore"), "utf8")).toBe(
      "node_modules\narca-*.key\narca-*.crt\n"
    );
  });

  it("leaves a directory without .gitignore alone", async () => {
    const { io, directory, stdout } = createTestIo();

    await runInit(
      io,
      { cuit: "20123456789", env: "test", dir: directory },
      createWriter(io.stdout, { color: false })
    );

    expect(stdout()).not.toContain(".gitignore");
  });

  it("uses --org and --name in the CSR subject", async () => {
    const { io, directory, stdout } = createTestIo();

    await runInit(
      io,
      {
        cuit: "20123456789",
        env: "test",
        dir: directory,
        name: "mi-sistema",
        org: "Prueba SRL",
      },
      createWriter(io.stdout, { color: false })
    );

    expect(stdout()).toContain("CN=mi-sistema");
    expect(stdout()).toContain("Alias: mi-sistema-test");
  });

  it("exits 2 without a TTY and without --cuit", async () => {
    const { io, directory, stderr } = createTestIo();

    const code = await runInit(
      io,
      { env: "test", dir: directory },
      createWriter(io.stdout, { color: false })
    );

    expect(code).toBe(2);
    expect(stderr()).toContain("Falta el CUIT.");
  });

  it("exits 2 without a TTY and without --env", async () => {
    const { io, directory, stderr } = createTestIo();

    const code = await runInit(
      io,
      { cuit: "20123456789", dir: directory },
      createWriter(io.stdout, { color: false })
    );

    expect(code).toBe(2);
    expect(stderr()).toContain("Falta el entorno.");
  });

  it("asks for the CUIT and the environment on a terminal", async () => {
    const context = createTestIo({ tty: true });

    const running = runInit(
      context.io,
      { dir: context.directory },
      createWriter(context.io.stdout, { color: false })
    );
    context.stdin.write("20123456789\n");
    await waitFor(() => context.prompts().includes("Entorno"));
    context.stdin.write("test\n");

    expect(await running).toBe(0);
    expect(context.prompts()).toContain("CUIT: ");
    expect(context.prompts()).toContain("Entorno [test/production]: ");
    expect(
      readFileSync(join(context.directory, "arca-test.csr"), "utf8")
    ).toContain("CERTIFICATE REQUEST");
  });

  it("exits 2 when the answered CUIT is not eleven digits", async () => {
    const context = createTestIo({ tty: true });

    const running = runInit(
      context.io,
      { dir: context.directory },
      createWriter(context.io.stdout, { color: false })
    );
    context.stdin.write("123\n");

    expect(await running).toBe(2);
    expect(context.stderr()).toContain("Falta el CUIT.");
  });

  it("exits 2 when the answered environment is not one ARCA has", async () => {
    const context = createTestIo({ tty: true });

    const running = runInit(
      context.io,
      { cuit: "20123456789", dir: context.directory },
      createWriter(context.io.stdout, { color: false })
    );
    await waitFor(() => context.prompts().includes("Entorno"));
    context.stdin.write("staging\n");

    expect(await running).toBe(2);
    expect(context.stderr()).toContain("Falta el entorno.");
  });

  it("rejects a CUIT that is not eleven digits", async () => {
    const { io, directory, stderr } = createTestIo();

    const code = await runInit(
      io,
      { cuit: "123", env: "test", dir: directory },
      createWriter(io.stdout, { color: false })
    );

    expect(code).toBe(2);
    expect(stderr()).toContain("Falta el CUIT.");
  });

  it("rejects an environment ARCA does not have", async () => {
    const { io, directory, stderr } = createTestIo();

    const code = await runInit(
      io,
      { cuit: "20123456789", env: "staging", dir: directory },
      createWriter(io.stdout, { color: false })
    );

    expect(code).toBe(2);
    expect(stderr()).toContain("Falta el entorno.");
  });
});

function createTestIo(options: { tty?: boolean } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "facturas-cli-"));
  created.push(directory);
  const out: string[] = [];
  const err: string[] = [];
  const prompted: string[] = [];
  const stdin = new PassThrough() as PassThrough & { isTTY?: boolean };
  if (options.tty === true) {
    stdin.isTTY = true;
  }
  const terminal = new PassThrough();
  terminal.on("data", (chunk: Buffer) => prompted.push(chunk.toString()));
  const collector: CliOutputStream = { write: (chunk) => out.push(chunk) };
  const stdout =
    options.tty === true
      ? (Object.assign(terminal, {
          write: (chunk: string) => {
            out.push(chunk);
            return terminal.push(chunk);
          },
        }) as unknown as CliOutputStream)
      : collector;
  const stderr: CliOutputStream = { write: (chunk) => err.push(chunk) };
  const io: CliIo = {
    stdout,
    stderr,
    stdin,
    env: {},
    cwd: directory,
    now: () => new Date("2026-09-06T00:00:00Z"),
    createClient: () => {
      throw new Error("init never builds a client");
    },
    createAuth: () => {
      throw new Error("init never logs in");
    },
  };
  return {
    io,
    directory,
    stdin,
    stdout: () => out.join(""),
    stderr: () => err.join(""),
    prompts: () => prompted.join(""),
  };
}

/** Waits for the next prompt before answering it: one readline at a time. */
async function waitFor(condition: () => boolean, attempts = 200) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error("the prompt never appeared");
}
