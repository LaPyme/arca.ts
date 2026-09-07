import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { ARCA_ENVIRONMENTS } from "../config";
import type { ArcaEnvironment } from "../internal/types";
import { createArcaCsrMaterial } from "./csr";
import { ARCA_PAGES } from "./diagnose";
import { CLI_EXIT, type CliIo, type CliWriter } from "./output";
import { ask, isInteractive } from "./prompt";

const TAX_ID_PATTERN = /^\d{11}$/;
const KEY_FILE_MODE = 0o600;
const GITIGNORE_PATTERNS = ["arca-*.key", "arca-*.crt"] as const;

export type InitFlags = {
  cuit?: string;
  env?: string;
  name?: string;
  dir?: string;
  force?: boolean;
  org?: string;
};

/** Generates the key and the CSR, then prints the exact ARCA steps. */
export async function runInit(
  io: CliIo,
  flags: InitFlags,
  writer: CliWriter
): Promise<number> {
  const resolved = await resolveInitInput(io, flags);
  if (resolved === undefined) {
    return CLI_EXIT.usage;
  }

  const { taxId, environment } = resolved;
  const directory = isAbsolute(flags.dir ?? "")
    ? (flags.dir as string)
    : resolve(io.cwd, flags.dir ?? ".");
  const commonName = flags.name?.trim() || "facturas";
  const alias = `${commonName}-${environment}`;
  const keyName = `arca-${environment}.key`;
  const csrName = `arca-${environment}.csr`;
  const certificateName = `arca-${environment}.crt`;
  const keyPath = resolve(directory, keyName);
  const csrPath = resolve(directory, csrName);

  const existing = [keyPath, csrPath].filter((path) => existsSync(path));
  if (existing.length > 0 && flags.force !== true) {
    io.stderr.write(
      `Ya existe ${existing.map((path) => path).join(" y ")}. Usá --force para sobrescribir.\n`
    );
    return CLI_EXIT.failed;
  }

  const material = createArcaCsrMaterial({
    taxId,
    commonName,
    organization: flags.org?.trim() || taxId,
  });
  writeFileSync(keyPath, material.privateKeyPem, { mode: KEY_FILE_MODE });
  chmodSync(keyPath, KEY_FILE_MODE);
  writeFileSync(csrPath, material.csrPem);

  writer.ok(keyName, "clave privada RSA 2048, permisos 0600");
  writer.ok(csrName, `CSR para ARCA, CN=${commonName}`);

  const ignored = appendToGitignore(directory);
  if (ignored.length > 0) {
    writer.ok(".gitignore", `agregué ${ignored.join(" y ")}`);
  }

  writePlan(writer, {
    alias,
    certificateName,
    csrName,
    environment,
    keyName,
    taxId,
  });
  return CLI_EXIT.ok;
}

async function resolveInitInput(
  io: CliIo,
  flags: InitFlags
): Promise<{ taxId: string; environment: ArcaEnvironment } | undefined> {
  const interactive = isInteractive(io);
  const taxId = await resolveTaxId(io, flags, interactive);
  if (taxId === undefined) {
    io.stderr.write(
      "Falta el CUIT. Pasá --cuit 20123456789 o ejecutá init en una terminal.\n"
    );
    return undefined;
  }

  const environment = await resolveEnvironment(io, flags, interactive);
  if (environment === undefined) {
    io.stderr.write("Falta el entorno. Pasá --env test o --env production.\n");
    return undefined;
  }

  return { taxId, environment };
}

async function resolveTaxId(
  io: CliIo,
  flags: InitFlags,
  interactive: boolean
): Promise<string | undefined> {
  const fromFlag = flags.cuit?.trim();
  if (fromFlag !== undefined && fromFlag !== "") {
    return TAX_ID_PATTERN.test(fromFlag) ? fromFlag : undefined;
  }
  if (!interactive) {
    return undefined;
  }
  const answer = await ask(io, "CUIT: ");
  return TAX_ID_PATTERN.test(answer) ? answer : undefined;
}

async function resolveEnvironment(
  io: CliIo,
  flags: InitFlags,
  interactive: boolean
): Promise<ArcaEnvironment | undefined> {
  const fromFlag = flags.env?.trim().toLowerCase();
  if (fromFlag !== undefined && fromFlag !== "") {
    return toEnvironment(fromFlag);
  }
  if (!interactive) {
    return undefined;
  }
  const answer = await ask(io, "Entorno [test/production]: ");
  return toEnvironment(answer.trim().toLowerCase());
}

function toEnvironment(value: string): ArcaEnvironment | undefined {
  return ARCA_ENVIRONMENTS.includes(value as ArcaEnvironment)
    ? (value as ArcaEnvironment)
    : undefined;
}

/** Appends the credential patterns to an existing `.gitignore`. Idempotent. */
function appendToGitignore(directory: string): string[] {
  const path = resolve(directory, ".gitignore");
  if (!existsSync(path)) {
    return [];
  }

  const current = readFileSync(path, "utf8");
  const lines = new Set(current.split("\n").map((line) => line.trim()));
  const missing = GITIGNORE_PATTERNS.filter((pattern) => !lines.has(pattern));
  if (missing.length === 0) {
    return [];
  }

  const prefix = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  writeFileSync(path, `${current}${prefix}${missing.join("\n")}\n`);
  return [...missing];
}

function writePlan(
  writer: CliWriter,
  context: {
    alias: string;
    certificateName: string;
    csrName: string;
    environment: ArcaEnvironment;
    keyName: string;
    taxId: string;
  }
): void {
  writer.blank();
  writer.line("Listo. Ahora en ARCA:");
  writer.blank();
  writer.line(`  1. Entrá con clave fiscal a ${ARCA_PAGES.login}`);
  writer.line(
    `  2. Homologación: en Mis Servicios, ${ARCA_PAGES.wsassService} → ${ARCA_PAGES.wsassNewCertificate}.`
  );
  writer.line(
    `     Producción: ${ARCA_PAGES.certificates} → ${ARCA_PAGES.certificatesAddAlias}.`
  );
  writer.line(`     Alias: ${context.alias}`);
  writer.line(`     Pegá el contenido de ${context.csrName}`);
  writer.line(
    `  3. Descargá el certificado y guardalo como ${context.certificateName}`
  );
  writer.line(
    `  4. Homologación: en el mismo WSASS, ${ARCA_PAGES.wsassAuthorizeService} → wsfe.`
  );
  writer.line(
    `     Producción: ${ARCA_PAGES.relationships} → ${ARCA_PAGES.relationshipsPath},`
  );
  writer.line(`     con el alias ${context.alias}.`);
  writer.blank();
  writer.line("Cuando tengas el certificado:");
  writer.blank();
  writer.line(`  export ARCA_TAX_ID=${context.taxId}`);
  writer.line(`  export ARCA_ENVIRONMENT=${context.environment}`);
  writer.line(
    `  export ARCA_CERTIFICATE_PEM="$(cat ${context.certificateName})"`
  );
  writer.line(`  export ARCA_PRIVATE_KEY_PEM="$(cat ${context.keyName})"`);
  writer.line("  npx facturas check");
}
