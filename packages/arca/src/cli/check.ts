import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { ArcaClient } from "../client";
import {
  ARCA_ENVIRONMENTS,
  ARCA_WSAA_CONFIG,
  assertArcaClientConfig,
  discoverArcaClientConfig,
} from "../config";
import {
  ArcaConfigurationError,
  ArcaServiceError,
  ArcaSoapFaultError,
  isArcaAuthenticationError,
} from "../errors";
import type {
  ArcaAuthCredentials,
  ArcaClientConfig,
  ArcaEnvironment,
  ArcaWsaaSessionStore,
} from "../internal/types";
import type { WsfeSalesPoint } from "../services/wsfe";
import { privateKeyMatchesCertificate, readCertificateFacts } from "./csr";
import {
  type CliDiagnosis,
  describeUnknownError,
  diagnose,
  diagnoseAuthenticationReason,
  diagnoseWsaaFaultCode,
  findSoapFault,
  findTransportError,
} from "./diagnose";
import { CLI_EXIT, type CliIo, type CliWriter } from "./output";

const EXPIRY_WARNING_DAYS = 30;
const MILLISECONDS_PER_DAY = 86_400_000;

/** The five layers, in the order ARCA breaks them. */
export type CliLayerName =
  | "env"
  | "certificate"
  | "wsaa"
  | "wsfe"
  | "salesPoints";

const LAYER_LABELS: Record<CliLayerName, string> = {
  env: "variables de entorno",
  certificate: "certificado y clave",
  wsaa: "WSAA",
  wsfe: "WSFE",
  salesPoints: "puntos de venta",
};

export type CliLayerReport = {
  name: CliLayerName;
  ok: boolean;
  detail?: string;
  expiresAt?: string;
  code?: string;
  reason?: string;
  diagnosis?: string;
  fix?: string;
  warning?: string;
};

export type CliSalesPointReport = {
  number: number;
  blocked: boolean;
  system?: string;
};

/** The whole `check` result. Layers never reached are absent, not false. */
export type CliCheckReport = {
  ok: boolean;
  environment?: ArcaEnvironment;
  taxId?: string;
  layers: CliLayerReport[];
  salesPoints?: CliSalesPointReport[];
};

export type CheckFlags = {
  cert?: string;
  key?: string;
  taxId?: string;
  env?: string;
  salesPoint?: number;
};

/** The report plus the client the passing layers built, for `issue` to reuse. */
export type CliCheckResult = {
  report: CliCheckReport;
  client?: ArcaClient;
};

/** Runs `check` and prints it. Never writes to ARCA. */
export async function runCheck(
  io: CliIo,
  flags: CheckFlags,
  writer: CliWriter,
  json: boolean
): Promise<number> {
  const { report } = await runCheckLayers(io, flags);
  if (json) {
    writer.json(report);
  } else {
    writeCheckReport(writer, report);
  }
  return report.ok ? CLI_EXIT.ok : CLI_EXIT.failed;
}

/** Runs the layers in order and stops at the first failure. */
export async function runCheckLayers(
  io: CliIo,
  flags: CheckFlags
): Promise<CliCheckResult> {
  const layers: CliLayerReport[] = [];
  const resolved = resolveConfigLayer(io, flags);
  layers.push(resolved.layer);
  if (!(resolved.layer.ok && resolved.config)) {
    return { report: { ok: false, layers } };
  }

  const config = resolved.config;
  const report: CliCheckReport = {
    ok: false,
    environment: config.environment,
    taxId: config.taxId,
    layers,
  };

  const certificate = checkCertificate(config, io.now());
  layers.push(certificate);
  if (!certificate.ok) {
    return { report };
  }

  const wsaa = await checkWsaa(io, config);
  layers.push(wsaa.layer);
  if (!wsaa.layer.ok) {
    return { report };
  }
  if (!wsaa.credentials) {
    // A valid ticket exists elsewhere, so WSAA is proven and WSFE is not run.
    report.ok = true;
    return { report };
  }

  const client = io.createClient({
    ...config,
    wsaaSessionStore: createEphemeralSessionStore(wsaa.credentials),
  });
  const wsfe = await checkWsfe(client);
  layers.push(wsfe.layer);
  if (!wsfe.layer.ok) {
    return { report, client };
  }

  const salesPoints = wsfe.salesPoints ?? [];
  report.salesPoints = salesPoints.map(toSalesPointReport);
  const layer = checkSalesPoints(
    report.salesPoints,
    config.environment,
    flags.salesPoint
  );
  layers.push(layer);
  report.ok = layer.ok;
  return { report, client };
}

/** Renders the report the way a shell would: one line per fact. */
export function writeCheckReport(
  writer: CliWriter,
  report: CliCheckReport
): void {
  for (const layer of report.layers) {
    const label = LAYER_LABELS[layer.name];
    if (layer.ok) {
      writer.ok(label, layer.detail);
    } else {
      writer.fail(label);
    }
    if (layer.diagnosis !== undefined) {
      writer.note(layer.diagnosis);
    }
    if (layer.fix !== undefined) {
      writer.note(layer.fix);
    }
    if (layer.name === "salesPoints") {
      for (const point of report.salesPoints ?? []) {
        writer.note(describeSalesPoint(point));
      }
    }
    if (layer.warning !== undefined) {
      writer.warn(label, layer.warning);
    }
  }
}

function resolveConfigLayer(
  io: CliIo,
  flags: CheckFlags
): { layer: CliLayerReport; config?: ArcaClientConfig } {
  const taxId = flags.taxId?.trim() || io.env.ARCA_TAX_ID?.trim();
  if (!taxId) {
    return { layer: failedLayer("env", diagnose("config.taxId")) };
  }

  const environment =
    flags.env?.trim().toLowerCase() || io.env.ARCA_ENVIRONMENT?.trim();
  if (!environment) {
    return { layer: failedLayer("env", diagnose("config.environment")) };
  }

  let certificatePem: string | undefined;
  let privateKeyPem: string | undefined;
  try {
    certificatePem = readPem(io, flags.cert, io.env.ARCA_CERTIFICATE_PEM);
    privateKeyPem = readPem(io, flags.key, io.env.ARCA_PRIVATE_KEY_PEM);
  } catch (error) {
    const unknown = describeUnknownError(error);
    return {
      layer: failedLayer("env", { diagnosis: unknown.diagnosis }, unknown.code),
    };
  }

  if (!(certificatePem && privateKeyPem)) {
    return { layer: failedLayer("env", diagnose("config.pem")) };
  }

  try {
    const config = discoverArcaClientConfig({
      taxId,
      certificatePem,
      privateKeyPem,
      environment: environment as ArcaEnvironment,
    });
    assertArcaClientConfig(config);
    return {
      layer: {
        name: "env",
        ok: true,
        detail: describeSources(flags, config.environment),
      },
      config,
    };
  } catch (error) {
    return { layer: failedLayer("env", toConfigDiagnosis(error)) };
  }
}

function readPem(
  io: CliIo,
  file: string | undefined,
  fromEnv: string | undefined
): string | undefined {
  if (file === undefined || file === "") {
    return fromEnv?.trim() || undefined;
  }
  const path = isAbsolute(file) ? file : resolve(io.cwd, file);
  return readFileSync(path, "utf8").trim();
}

function describeSources(
  flags: CheckFlags,
  environment: ArcaEnvironment
): string {
  const taxIdSource = flags.taxId?.trim() ? "--tax-id" : "ARCA_TAX_ID";
  const environmentSource = flags.env?.trim() ? "--env" : "ARCA_ENVIRONMENT";
  return `${taxIdSource}, ${environmentSource}=${environment}`;
}

function toConfigDiagnosis(error: unknown): CliDiagnosis {
  if (!(error instanceof ArcaConfigurationError)) {
    return { diagnosis: describeUnknownError(error).diagnosis };
  }
  if (error.message.includes("taxId")) {
    return diagnose("config.taxId");
  }
  if (error.message.includes("environment")) {
    return diagnose("config.environment");
  }
  if (
    error.message.includes("certificatePem") ||
    error.message.includes("privateKeyPem") ||
    error.message.includes("Encrypted private keys")
  ) {
    return diagnose("cert.invalid");
  }
  return { diagnosis: error.message };
}

function checkCertificate(config: ArcaClientConfig, now: Date): CliLayerReport {
  let facts: ReturnType<typeof readCertificateFacts>;
  let matches: boolean;
  try {
    facts = readCertificateFacts(config.certificatePem);
    matches = privateKeyMatchesCertificate(
      config.certificatePem,
      config.privateKeyPem
    );
  } catch {
    return failedLayer("certificate", diagnose("cert.invalid"));
  }

  const expiresAt = toIsoDate(facts.notAfter);
  if (facts.notAfter.getTime() <= now.getTime()) {
    return failedLayer(
      "certificate",
      diagnose("cert.expired", { date: expiresAt })
    );
  }
  if (!matches) {
    return failedLayer("certificate", diagnose("cert.mismatch"));
  }

  const daysLeft = Math.floor(
    (facts.notAfter.getTime() - now.getTime()) / MILLISECONDS_PER_DAY
  );
  return {
    name: "certificate",
    ok: true,
    detail: `coinciden, vence ${expiresAt}`,
    expiresAt,
    ...(daysLeft < EXPIRY_WARNING_DAYS
      ? { warning: `vence en ${daysLeft} ${daysLeft === 1 ? "día" : "días"}` }
      : {}),
  };
}

async function checkWsaa(
  io: CliIo,
  config: ArcaClientConfig
): Promise<{ layer: CliLayerReport; credentials?: ArcaAuthCredentials }> {
  try {
    const auth = io.createAuth(config);
    const credentials = await auth.login("wsfe", { forceRefresh: true });
    return {
      layer: { name: "wsaa", ok: true, detail: "ticket obtenido" },
      credentials,
    };
  } catch (error) {
    return { layer: toWsaaFailure(error, config.environment) };
  }
}

function toWsaaFailure(
  error: unknown,
  environment: ArcaEnvironment
): CliLayerReport {
  const fault = findSoapFault(error);
  const key = diagnoseWsaaFaultCode(fault?.faultCode);
  if (key === "wsaa.alreadyAuthenticated") {
    const row = diagnose(key);
    return {
      name: "wsaa",
      ok: true,
      detail: "ticket vigente",
      diagnosis: row.diagnosis,
      ...(row.fix === undefined ? {} : { fix: row.fix }),
    };
  }
  if (key !== undefined) {
    return failedLayer("wsaa", diagnose(key), fault?.code);
  }

  const transport = findTransportError(error);
  if (transport) {
    const host = new URL(ARCA_WSAA_CONFIG.endpoint[environment]).host;
    return failedLayer(
      "wsaa",
      diagnose("wsaa.transport", { host }),
      transport.code
    );
  }

  const unknown = describeUnknownError(error);
  return failedLayer("wsaa", { diagnosis: unknown.diagnosis }, unknown.code);
}

async function checkWsfe(
  client: ArcaClient
): Promise<{ layer: CliLayerReport; salesPoints?: WsfeSalesPoint[] }> {
  try {
    const status = await client.wsfe.getServerStatus();
    const down = [
      ["appServer", status.appServer],
      ["dbServer", status.dbServer],
      ["authServer", status.authServer],
    ].filter(([, value]) => value.toUpperCase() !== "OK");
    if (down.length > 0) {
      const message = down
        .map(([name, value]) => `${name}=${value}`)
        .join(", ");
      return {
        layer: failedLayer("wsfe", diagnose("wsfe.serviceError", { message })),
      };
    }

    const salesPoints = await client.wsfe.getSalesPoints({});
    return {
      layer: { name: "wsfe", ok: true, detail: "servidor ok" },
      salesPoints,
    };
  } catch (error) {
    return { layer: toWsfeFailure(error) };
  }
}

function toWsfeFailure(error: unknown): CliLayerReport {
  if (isArcaAuthenticationError(error)) {
    return {
      ...failedLayer(
        "wsfe",
        diagnoseAuthenticationReason(error.reason),
        error.code
      ),
      reason: error.reason,
    };
  }
  if (
    error instanceof ArcaServiceError ||
    error instanceof ArcaSoapFaultError
  ) {
    return failedLayer(
      "wsfe",
      diagnose("wsfe.serviceError", { message: error.message }),
      error.code
    );
  }
  const unknown = describeUnknownError(error);
  return failedLayer("wsfe", { diagnosis: unknown.diagnosis }, unknown.code);
}

function checkSalesPoints(
  points: CliSalesPointReport[],
  environment: ArcaEnvironment,
  requested: number | undefined
): CliLayerReport {
  if (requested !== undefined) {
    const found = points.find((point) => point.number === requested);
    if (!found) {
      return failedLayer(
        "salesPoints",
        diagnose("salesPoint.missing", { salesPoint: requested })
      );
    }
    if (found.blocked) {
      return failedLayer(
        "salesPoints",
        diagnose("salesPoint.blocked", { salesPoint: requested })
      );
    }
    return {
      name: "salesPoints",
      ok: true,
      detail: describeSalesPoint(found),
    };
  }

  if (points.length === 0) {
    return {
      name: "salesPoints",
      ok: true,
      detail: "ninguno informado",
      warning:
        environment === "test"
          ? "en homologación ARCA suele no informarlos; probá igual con issue"
          : "ARCA no informó ningún punto de venta",
    };
  }

  return {
    name: "salesPoints",
    ok: true,
    detail: `${points.length} ${points.length === 1 ? "informado" : "informados"}`,
  };
}

/** Keeps the ticket from the WSAA layer in memory so WSFE reuses it. */
function createEphemeralSessionStore(
  credentials: ArcaAuthCredentials
): ArcaWsaaSessionStore {
  return {
    get: () => Promise.resolve(credentials),
    set: () => Promise.resolve(),
  };
}

function toSalesPointReport(point: WsfeSalesPoint): CliSalesPointReport {
  return {
    number: point.number,
    blocked: (point.blocked ?? "N").trim().toUpperCase().startsWith("S"),
    ...(point.emissionType === undefined ? {} : { system: point.emissionType }),
  };
}

function describeSalesPoint(point: CliSalesPointReport): string {
  const state = point.blocked ? "bloqueado" : "habilitado";
  return point.system === undefined
    ? `${point.number} (${state})`
    : `${point.number} (${state}, ${point.system})`;
}

function failedLayer(
  name: CliLayerName,
  row: CliDiagnosis,
  code?: string
): CliLayerReport {
  return {
    name,
    ok: false,
    diagnosis: row.diagnosis,
    ...(row.fix === undefined ? {} : { fix: row.fix }),
    ...(code === undefined ? {} : { code }),
  };
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Exposed for `issue`, which validates the environment before running. */
export function isKnownEnvironment(value: string): value is ArcaEnvironment {
  return ARCA_ENVIRONMENTS.includes(value as ArcaEnvironment);
}
