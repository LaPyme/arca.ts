import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type ParseArgsConfig, parseArgs } from "node:util";
import { createArcaClient } from "../client";
import type { ArcaClientConfig } from "../internal/types";
import { createWsaaAuthModule } from "../wsaa";
import { type CheckFlags, runCheck } from "./check";
import { type InitFlags, runInit } from "./init";
import { type IssueFlags, runIssue } from "./issue";
import { CLI_EXIT, type CliIo, createWriter, shouldUseColor } from "./output";

const COMMANDS = ["init", "check", "issue"] as const;
type Command = (typeof COMMANDS)[number];

type OptionConfig = NonNullable<ParseArgsConfig["options"]>;

const GLOBAL_OPTIONS: OptionConfig = {
  help: { type: "boolean" },
  version: { type: "boolean" },
  json: { type: "boolean" },
  "no-color": { type: "boolean" },
};

const COMMAND_OPTIONS: Record<Command, OptionConfig> = {
  init: {
    ...GLOBAL_OPTIONS,
    cuit: { type: "string" },
    env: { type: "string" },
    name: { type: "string" },
    org: { type: "string" },
    dir: { type: "string" },
    force: { type: "boolean" },
  },
  check: {
    ...GLOBAL_OPTIONS,
    cert: { type: "string" },
    key: { type: "string" },
    "tax-id": { type: "string" },
    env: { type: "string" },
    "sales-point": { type: "string" },
    "no-cache": { type: "boolean" },
  },
  issue: {
    ...GLOBAL_OPTIONS,
    cert: { type: "string" },
    key: { type: "string" },
    "tax-id": { type: "string" },
    env: { type: "string" },
    "sales-point": { type: "string" },
    "no-cache": { type: "boolean" },
    issuer: { type: "string" },
  },
};

const USAGE = `facturas — CLI de onboarding para ARCA

Uso:
  npx facturas init      clave privada y CSR, más los pasos exactos en ARCA
  npx facturas check     prueba cada capa en orden y nombra la que falla
  npx facturas issue     una factura de ARS 1 en homologación, solo a pedido

Opciones de init:
  --cuit <cuit>          CUIT de 11 dígitos
  --env <test|production>
  --name <alias>         common name del CSR (por defecto facturas)
  --org <razón social>   organización del CSR (por defecto el CUIT)
  --dir <directorio>     dónde escribir los archivos (por defecto el actual)
  --force                sobrescribe los archivos existentes

Opciones de check e issue:
  --cert <archivo>       certificado PEM desde un archivo
  --key <archivo>        clave privada PEM desde un archivo
  --tax-id <cuit>        CUIT, en lugar de ARCA_TAX_ID
  --env <test|production>  entorno, en lugar de ARCA_ENVIRONMENT
  --sales-point <n>      punto de venta a verificar o a usar
  --no-cache             no reusa ni guarda el ticket WSAA

Opciones de issue:
  --issuer <monotributo|responsable_inscripto|exento|no_alcanzado>

Opciones globales:
  --json                 salida JSON en check e issue
  --no-color             sin ANSI
  --help, --version

init y check nunca escriben en ARCA. Guardan el ticket WSAA en el directorio
temporal del sistema para poder repetirse; --no-cache lo evita. issue emite un
comprobante real de homologación y se niega fuera de test.
`;

/** Runs one CLI invocation and returns its exit code. Never calls `exit`. */
export async function run(argv: readonly string[], io: CliIo): Promise<number> {
  const command = argv.find((token) => !token.startsWith("-"));
  const wantsHelp = argv.includes("--help") || argv.includes("-h");
  const wantsVersion = argv.includes("--version") || argv.includes("-v");

  if (wantsVersion && command === undefined) {
    io.stdout.write(`${readCliVersion()}\n`);
    return CLI_EXIT.ok;
  }
  if (wantsHelp || command === undefined) {
    const target = wantsHelp ? io.stdout : io.stderr;
    target.write(USAGE);
    return wantsHelp ? CLI_EXIT.ok : CLI_EXIT.usage;
  }
  if (!isCommand(command)) {
    io.stderr.write(`Comando desconocido: ${command}\n\n${USAGE}`);
    return CLI_EXIT.usage;
  }

  let values: Record<string, string | boolean | undefined>;
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: COMMAND_OPTIONS[command],
      allowPositionals: true,
      strict: true,
    }) as { values: Record<string, string | boolean | undefined> });
  } catch (error) {
    io.stderr.write(`${describeParseError(error)}\n\n${USAGE}`);
    return CLI_EXIT.usage;
  }

  const json = values.json === true;
  const writer = createWriter(io.stdout, {
    color: shouldUseColor(io.stdout, io.env, values["no-color"] === true),
  });

  if (command === "init") {
    return await runInit(io, toInitFlags(values), writer);
  }

  const salesPoint = parseSalesPoint(values["sales-point"]);
  if (values["sales-point"] !== undefined && salesPoint === undefined) {
    io.stderr.write("--sales-point espera un número entero positivo.\n");
    return CLI_EXIT.usage;
  }

  const shared = toCheckFlags(values, salesPoint);
  if (command === "check") {
    return await runCheck(io, shared, writer, json);
  }
  return await runIssue(io, toIssueFlags(values, shared), writer, json);
}

/** Entry point used by `bin/facturas.mjs`. Sets the process exit code. */
export async function main(argv: readonly string[] = process.argv.slice(2)) {
  process.exitCode = await run(argv, createDefaultIo());
}

/** The real world: real streams, real env, the real SDK. */
export function createDefaultIo(): CliIo {
  return {
    stdout: process.stdout,
    stderr: process.stderr,
    stdin: process.stdin,
    env: process.env,
    cwd: process.cwd(),
    cacheDir: join(tmpdir(), "facturas-cli"),
    now: () => new Date(),
    createClient: (options) => createArcaClient(options),
    createAuth: (config: ArcaClientConfig) => createWsaaAuthModule({ config }),
  };
}

/** Reads the published version from the nearest `package.json`. */
export function readCliVersion(): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 5; depth += 1) {
    try {
      const raw = readFileSync(join(directory, "package.json"), "utf8");
      const parsed = JSON.parse(raw) as { version?: string };
      if (typeof parsed.version === "string") {
        return parsed.version;
      }
    } catch {
      // Keep walking up: bundled output and source sit at different depths.
    }
    directory = dirname(directory);
  }
  return "0.0.0";
}

/** Node reports parse failures in English; the CLI only speaks castellano. */
function describeParseError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const unknownOption = /Unknown option '([^']+)'/.exec(message)?.[1];
  if (unknownOption !== undefined) {
    return `Opción desconocida: ${unknownOption}`;
  }
  const missingValue = /Option '([^']+)' argument missing/.exec(message)?.[1];
  if (missingValue !== undefined) {
    return `Falta el valor de ${missingValue}`;
  }
  return "Argumentos inválidos.";
}

function isCommand(value: string): value is Command {
  return COMMANDS.includes(value as Command);
}

function toInitFlags(
  values: Record<string, string | boolean | undefined>
): InitFlags {
  return {
    ...text(values, "cuit", "cuit"),
    ...text(values, "env", "env"),
    ...text(values, "name", "name"),
    ...text(values, "org", "org"),
    ...text(values, "dir", "dir"),
    ...(values.force === true ? { force: true } : {}),
  };
}

function toCheckFlags(
  values: Record<string, string | boolean | undefined>,
  salesPoint: number | undefined
): CheckFlags {
  return {
    ...text(values, "cert", "cert"),
    ...text(values, "key", "key"),
    ...text(values, "tax-id", "taxId"),
    ...text(values, "env", "env"),
    ...(salesPoint === undefined ? {} : { salesPoint }),
    ...(values["no-cache"] === true ? { noCache: true } : {}),
  };
}

function toIssueFlags(
  values: Record<string, string | boolean | undefined>,
  shared: CheckFlags
): IssueFlags {
  return { ...shared, ...text(values, "issuer", "issuer") };
}

function text<TKey extends string>(
  values: Record<string, string | boolean | undefined>,
  from: string,
  to: TKey
): Partial<Record<TKey, string>> {
  const value = values[from];
  return typeof value === "string"
    ? ({ [to]: value } as Record<TKey, string>)
    : {};
}

function parseSalesPoint(
  value: string | boolean | undefined
): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
