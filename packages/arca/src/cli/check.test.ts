import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import forge from "node-forge";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArcaClient } from "../client";
import {
  ArcaAuthenticationError,
  ArcaServiceError,
  ArcaSoapFaultError,
  ArcaTransportError,
} from "../errors";
import type { ArcaAuthCredentials } from "../internal/types";
import type { WsfeSalesPoint } from "../services/wsfe";
import { type CheckFlags, runCheck } from "./check";
import { type CliIo, type CliOutputStream, createWriter } from "./output";

const NOW = new Date("2026-09-06T00:00:00Z");
const VALID = createSelfSigned(new Date("2027-09-05T12:00:00Z"));
const OTHER = createSelfSigned(new Date("2027-09-05T12:00:00Z"));
const EXPIRING = createSelfSigned(new Date("2026-09-16T00:00:00Z"));
const EXPIRED = createSelfSigned(new Date("2026-01-31T00:00:00Z"));

const TICKET: ArcaAuthCredentials = {
  token: "TOKEN-SECRETO",
  sign: "FIRMA-SECRETA",
  expiresAt: "2099-01-01T00:00:00Z",
};

const temporary: string[] = [];

afterEach(() => {
  for (const directory of temporary.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("runCheck env layer", () => {
  it("names the missing CUIT", async () => {
    const context = createContext({ env: { ARCA_ENVIRONMENT: "test" } });

    expect(await run(context, {})).toBe(1);
    expect(context.stdout()).toMatchInlineSnapshot(`
      "✗ variables de entorno
        Falta el CUIT.
        export ARCA_TAX_ID=20123456789
      "
    `);
  });

  it("names the missing environment", async () => {
    const context = createContext({ env: { ARCA_TAX_ID: "20123456789" } });

    expect(await run(context, {})).toBe(1);
    expect(context.stdout()).toContain("Falta el entorno.");
    expect(context.stdout()).toContain("export ARCA_ENVIRONMENT=test");
  });

  it("names the missing PEMs", async () => {
    const context = createContext({
      env: { ARCA_TAX_ID: "20123456789", ARCA_ENVIRONMENT: "test" },
    });

    expect(await run(context, {})).toBe(1);
    expect(context.stdout()).toContain("Falta el certificado o la clave.");
  });

  it("rejects a CUIT that is not eleven digits", async () => {
    const context = createContext({ env: fullEnv({ ARCA_TAX_ID: "123" }) });

    expect(await run(context, {})).toBe(1);
    expect(context.stdout()).toContain("Falta el CUIT.");
  });

  it("rejects an environment ARCA does not have", async () => {
    const context = createContext({
      env: fullEnv({ ARCA_ENVIRONMENT: "staging" }),
    });

    expect(await run(context, {})).toBe(1);
    expect(context.stdout()).toContain("Falta el entorno.");
  });

  it("loads the PEMs from --cert and --key", async () => {
    const directory = createTemporaryDirectory();
    writeFileSync(join(directory, "arca.crt"), VALID.certificatePem);
    writeFileSync(join(directory, "arca.key"), VALID.privateKeyPem);
    const context = createContext({
      env: { ARCA_TAX_ID: "20123456789", ARCA_ENVIRONMENT: "test" },
      salesPoints: [{ number: 3, blocked: "N", emissionType: "CAE" }],
    });

    const code = await run(context, {
      cert: join(directory, "arca.crt"),
      key: join(directory, "arca.key"),
    });

    expect(code).toBe(0);
    expect(context.stdout()).toContain("ARCA_TAX_ID, ARCA_ENVIRONMENT=test");
  });

  it("reports a file it cannot read with the SDK's safe message", async () => {
    const context = createContext({
      env: { ARCA_TAX_ID: "20123456789", ARCA_ENVIRONMENT: "test" },
    });

    expect(await run(context, { cert: "/no/existe.crt" })).toBe(1);
    expect(context.stdout()).toContain("ENOENT");
  });

  it("names the flags when the values came from flags", async () => {
    const context = createContext({
      env: {
        ARCA_CERTIFICATE_PEM: VALID.certificatePem,
        ARCA_PRIVATE_KEY_PEM: VALID.privateKeyPem,
      },
      salesPoints: [],
    });

    await run(context, { taxId: "20123456789", env: "test" });

    expect(context.stdout()).toContain("--tax-id, --env=test");
  });
});

describe("runCheck certificate layer", () => {
  it("reports a PEM that does not parse", async () => {
    const context = createContext({
      env: fullEnv({
        ARCA_CERTIFICATE_PEM: "-----BEGIN CERTIFICATE-----\nno\n",
      }),
    });

    expect(await run(context, {})).toBe(1);
    expect(context.stdout()).toContain("El archivo no es un PEM válido.");
  });

  it("reports a key that belongs to another certificate", async () => {
    const context = createContext({
      env: fullEnv({ ARCA_PRIVATE_KEY_PEM: OTHER.privateKeyPem }),
    });

    expect(await run(context, {})).toBe(1);
    expect(context.stdout()).toMatchInlineSnapshot(`
      "✓ variables de entorno   ARCA_TAX_ID, ARCA_ENVIRONMENT=test
      ✗ certificado y clave
        La clave privada no corresponde a este certificado.
        Usá la clave con la que generaste el CSR (arca-<entorno>.key).
      "
    `);
  });

  it("reports an expired certificate with its date", async () => {
    const context = createContext({
      env: fullEnv({
        ARCA_CERTIFICATE_PEM: EXPIRED.certificatePem,
        ARCA_PRIVATE_KEY_PEM: EXPIRED.privateKeyPem,
      }),
    });

    expect(await run(context, {})).toBe(1);
    expect(context.stdout()).toContain("El certificado venció el 2026-01-31.");
  });

  it("warns under thirty days and still exits 0", async () => {
    const context = createContext({
      env: fullEnv({
        ARCA_CERTIFICATE_PEM: EXPIRING.certificatePem,
        ARCA_PRIVATE_KEY_PEM: EXPIRING.privateKeyPem,
      }),
      salesPoints: [{ number: 3, blocked: "N", emissionType: "CAE" }],
    });

    expect(await run(context, {})).toBe(0);
    expect(context.stdout()).toContain(
      "! certificado y clave    vence en 10 días"
    );
  });
});

describe("runCheck WSAA layer", () => {
  it("never reuses a stored ticket", async () => {
    const context = createContext({
      env: fullEnv(),
      salesPoints: [],
    });

    await run(context, {});

    expect(context.login).toHaveBeenCalledWith("wsfe", { forceRefresh: true });
    expect(context.clientOptions?.store).toBeUndefined();
  });

  it("names an unauthorized certificate", async () => {
    const context = createContext({
      env: fullEnv(),
      loginError: new ArcaSoapFaultError("rechazado", {
        faultCode: "ns1:coe.notAuthorized",
      }),
    });

    expect(await run(context, {})).toBe(1);
    expect(context.stdout()).toContain(
      "El certificado no está autorizado para wsfe."
    );
    expect(context.stdout()).toContain("Crear autorización a servicio");
  });

  it("names a clock that drifted", async () => {
    const context = createContext({
      env: fullEnv(),
      loginError: new ArcaSoapFaultError("rechazado", {
        faultCode: "ns1:xml.generationTime.invalid",
      }),
    });

    expect(await run(context, {})).toBe(1);
    expect(context.stdout()).toContain("Sincronizá el reloj (NTP)");
  });

  it("names the host it could not reach", async () => {
    const context = createContext({
      env: fullEnv(),
      loginError: new ArcaTransportError("sin red"),
    });

    expect(await run(context, {})).toBe(1);
    expect(context.stdout()).toContain(
      "No se pudo conectar con wsaahomo.afip.gov.ar."
    );
  });

  it("treats an existing ticket as a pass and stops there", async () => {
    const context = createContext({
      env: fullEnv(),
      loginError: new ArcaSoapFaultError("ya autenticado", {
        faultCode: "ns1:coe.alreadyAuthenticated",
      }),
    });

    expect(await run(context, {})).toBe(0);
    expect(context.stdout()).toContain(
      "✓ WSAA                   ticket vigente"
    );
    expect(context.stdout()).toContain(
      "Ya hay un ticket vigente para este certificado."
    );
    expect(context.stdout()).not.toContain("WSFE");
  });

  it("falls back to the SDK's safe message for an unknown failure", async () => {
    const context = createContext({
      env: fullEnv(),
      loginError: new Error("algo raro"),
    });

    expect(await run(context, {})).toBe(1);
    expect(context.stdout()).toContain("algo raro");
  });
});

describe("runCheck WSFE layer", () => {
  it("names a missing relationship", async () => {
    const context = createContext({
      env: fullEnv(),
      salesPointsError: new ArcaAuthenticationError("rechazado", {
        reason: "missing_relationship",
        service: "wsfe",
        operation: "FEParamGetPtosVenta",
      }),
    });

    expect(await run(context, {})).toBe(1);
    expect(context.stdout()).toMatchInlineSnapshot(`
      "✓ variables de entorno   ARCA_TAX_ID, ARCA_ENVIRONMENT=test
      ✓ certificado y clave    coinciden, vence 2027-09-05
      ✓ WSAA                   ticket obtenido
      ✗ WSFE
        El certificado no tiene la relación con Facturación Electrónica.
        Administrador de Relaciones → Nueva Relación → WebServices → Facturación Electrónica.
      "
    `);
  });

  it("names a service error with ARCA's own message", async () => {
    const context = createContext({
      env: fullEnv(),
      salesPointsError: new ArcaServiceError("602 no encontrado"),
    });

    expect(await run(context, {})).toBe(1);
    expect(context.stdout()).toContain(
      "ARCA respondió con un error: 602 no encontrado."
    );
  });

  it("fails when a WSFE component is down", async () => {
    const context = createContext({
      env: fullEnv(),
      serverStatus: { appServer: "OK", dbServer: "ERROR", authServer: "OK" },
    });

    expect(await run(context, {})).toBe(1);
    expect(context.stdout()).toContain("dbServer=ERROR");
  });

  it("reuses the WSAA ticket instead of logging in again", async () => {
    const context = createContext({ env: fullEnv(), salesPoints: [] });

    await run(context, {});

    const stored = await context.clientOptions?.wsaaSessionStore?.get({
      environment: "test",
      service: "wsfe",
      certificateFingerprint: "any",
    });
    expect(stored).toEqual(TICKET);
  });
});

describe("runCheck sales points layer", () => {
  it("lists each point on its own line", async () => {
    const context = createContext({
      env: fullEnv(),
      salesPoints: [
        { number: 3, blocked: "N", emissionType: "CAE" },
        { number: 4, blocked: "N", emissionType: "CAE" },
      ],
    });

    expect(await run(context, {})).toBe(0);
    expect(context.stdout()).toMatchInlineSnapshot(`
      "✓ variables de entorno   ARCA_TAX_ID, ARCA_ENVIRONMENT=test
      ✓ certificado y clave    coinciden, vence 2027-09-05
      ✓ WSAA                   ticket obtenido
      ✓ WSFE                   servidor ok
      ✓ puntos de venta        2 informados
        3 (habilitado, CAE)
        4 (habilitado, CAE)
      "
    `);
  });

  it("warns instead of failing when homologación reports none", async () => {
    const context = createContext({ env: fullEnv(), salesPoints: [] });

    expect(await run(context, {})).toBe(0);
    expect(context.stdout()).toContain(
      "✓ puntos de venta        ninguno informado"
    );
    expect(context.stdout()).toContain(
      "en homologación ARCA suele no informarlos"
    );
  });

  it("fails when the requested point is not listed", async () => {
    const context = createContext({
      env: fullEnv(),
      salesPoints: [{ number: 3, blocked: "N", emissionType: "CAE" }],
    });

    expect(await run(context, { salesPoint: 9 })).toBe(1);
    expect(context.stdout()).toContain(
      "El punto de venta 9 no está habilitado para web services."
    );
  });

  it("fails when the requested point is blocked", async () => {
    const context = createContext({
      env: fullEnv(),
      salesPoints: [{ number: 3, blocked: "S", emissionType: "CAE" }],
    });

    expect(await run(context, { salesPoint: 3 })).toBe(1);
    expect(context.stdout()).toContain("El punto de venta 3 está bloqueado.");
  });

  it("shows only the requested point when one is given", async () => {
    const context = createContext({
      env: fullEnv(),
      salesPoints: [
        { number: 3, blocked: "N", emissionType: "CAE" },
        { number: 4, blocked: "N", emissionType: "CAE" },
      ],
    });

    expect(await run(context, { salesPoint: 4 })).toBe(0);
    expect(context.stdout()).toContain(
      "✓ puntos de venta        4 (habilitado, CAE)"
    );
  });
});

describe("runCheck --json", () => {
  it("prints the whole report and omits the layers it never reached", async () => {
    const context = createContext({
      env: fullEnv(),
      salesPointsError: new ArcaAuthenticationError("rechazado", {
        reason: "missing_relationship",
        service: "wsfe",
        operation: "FEParamGetPtosVenta",
      }),
    });

    await runCheck(
      context.io,
      {},
      createWriter(context.io.stdout, { color: false }),
      true
    );

    expect(JSON.parse(context.stdout())).toEqual({
      ok: false,
      environment: "test",
      taxId: "20123456789",
      layers: [
        {
          name: "env",
          ok: true,
          detail: "ARCA_TAX_ID, ARCA_ENVIRONMENT=test",
        },
        {
          name: "certificate",
          ok: true,
          detail: "coinciden, vence 2027-09-05",
          expiresAt: "2027-09-05",
        },
        { name: "wsaa", ok: true, detail: "ticket obtenido" },
        {
          name: "wsfe",
          ok: false,
          code: "ARCA_AUTHENTICATION_ERROR",
          reason: "missing_relationship",
          diagnosis:
            "El certificado no tiene la relación con Facturación Electrónica.",
          fix: "Administrador de Relaciones → Nueva Relación → WebServices → Facturación Electrónica.",
        },
      ],
    });
  });

  it("carries the sales points as data", async () => {
    const context = createContext({
      env: fullEnv(),
      salesPoints: [{ number: 3, blocked: "N", emissionType: "CAE" }],
    });

    await runCheck(
      context.io,
      {},
      createWriter(context.io.stdout, { color: false }),
      true
    );

    expect(JSON.parse(context.stdout()).salesPoints).toEqual([
      { number: 3, blocked: false, system: "CAE" },
    ]);
  });

  it("never prints the ticket, the certificate or the key", async () => {
    const context = createContext({
      env: fullEnv(),
      salesPoints: [{ number: 3, blocked: "N", emissionType: "CAE" }],
    });

    await runCheck(
      context.io,
      {},
      createWriter(context.io.stdout, { color: false }),
      true
    );

    const printed = context.stdout();
    expect(printed).not.toContain("TOKEN-SECRETO");
    expect(printed).not.toContain("FIRMA-SECRETA");
    expect(printed).not.toContain("BEGIN CERTIFICATE");
    expect(printed).not.toContain("BEGIN RSA PRIVATE KEY");
  });
});

type TestContext = ReturnType<typeof createContext>;

function run(context: TestContext, flags: CheckFlags) {
  return runCheck(
    context.io,
    flags,
    createWriter(context.io.stdout, { color: false }),
    false
  );
}

function fullEnv(overrides: Record<string, string> = {}) {
  return {
    ARCA_TAX_ID: "20123456789",
    ARCA_ENVIRONMENT: "test",
    ARCA_CERTIFICATE_PEM: VALID.certificatePem,
    ARCA_PRIVATE_KEY_PEM: VALID.privateKeyPem,
    ...overrides,
  };
}

function createContext(options: {
  env: Record<string, string | undefined>;
  loginError?: unknown;
  serverStatus?: { appServer: string; dbServer: string; authServer: string };
  salesPoints?: WsfeSalesPoint[];
  salesPointsError?: unknown;
  issue?: () => Promise<unknown>;
}) {
  const out: string[] = [];
  const stdout: CliOutputStream = { write: (chunk) => out.push(chunk) };
  const stderr: CliOutputStream = { write: () => undefined };
  const login = vi.fn(() =>
    options.loginError === undefined
      ? Promise.resolve(TICKET)
      : Promise.reject(options.loginError)
  );
  const context = {
    login,
    clientOptions: undefined as Record<string, never> | undefined,
    stdout: () => out.join(""),
    io: {} as CliIo,
  } as unknown as {
    login: typeof login;
    clientOptions?: {
      store?: unknown;
      wsaaSessionStore?: {
        get(key: unknown): Promise<ArcaAuthCredentials | null>;
      };
    };
    stdout(): string;
    io: CliIo;
  };

  context.io = {
    stdout,
    stderr,
    stdin: new PassThrough(),
    env: options.env,
    cwd: tmpdir(),
    now: () => NOW,
    createClient: (clientOptions) => {
      context.clientOptions = clientOptions as never;
      return {
        wsfe: {
          getServerStatus: () =>
            Promise.resolve(
              options.serverStatus ?? {
                appServer: "OK",
                dbServer: "OK",
                authServer: "OK",
              }
            ),
          getSalesPoints: () =>
            options.salesPointsError === undefined
              ? Promise.resolve(options.salesPoints ?? [])
              : Promise.reject(options.salesPointsError),
        },
        issue: options.issue ?? (() => Promise.reject(new Error("no issue"))),
      } as unknown as ArcaClient;
    },
    createAuth: () => ({ login }) as never,
  };

  return context;
}

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "facturas-check-"));
  temporary.push(directory);
  return directory;
}

function createSelfSigned(notAfter: Date) {
  const keyPair = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x01_00_01 });
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keyPair.publicKey;
  certificate.serialNumber = "01";
  certificate.validity.notBefore = new Date("2020-01-01T00:00:00Z");
  certificate.validity.notAfter = notAfter;
  const attributes = [{ name: "commonName", value: "facturas" }];
  certificate.setSubject(attributes);
  certificate.setIssuer(attributes);
  certificate.sign(keyPair.privateKey, forge.md.sha256.create());
  return {
    certificatePem: forge.pki.certificateToPem(certificate),
    privateKeyPem: forge.pki.privateKeyToPem(keyPair.privateKey),
  };
}
