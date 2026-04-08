export type { ArcaClient } from "./client";
// biome-ignore lint/performance/noBarrelFile: package entrypoint re-exports runtime client factory
export { createArcaClient } from "./client";
export {
  ARCA_ENVIRONMENTS,
  ARCA_ENV_VARIABLES,
  assertArcaClientConfig,
  createArcaClientConfigFromEnv,
  resolveArcaEnvironment,
} from "./config";
export {
  ArcaConfigurationError,
  ArcaError,
  ArcaNotImplementedError,
  ArcaServiceError,
  ArcaSoapFaultError,
  ArcaTransportError,
} from "./errors";
export type {
  ArcaAuthCredentials,
  ArcaAuthOptions,
  ArcaClientConfig,
  ArcaEnvironment,
  ArcaPadronServiceName,
  ArcaRepresentedTaxId,
  ArcaServiceName,
  ArcaServiceTarget,
  ArcaWsaaCacheConfig,
  ArcaWsaaServiceId,
} from "./types";
export type {
  CreatePadronServiceOptions,
  PadronService,
} from "./services/padron";
export { createPadronService } from "./services/padron";
export type { CreateWsfeServiceOptions, WsfeService } from "./services/wsfe";
export { createWsfeService } from "./services/wsfe";
export type {
  CreateWsmtxcaServiceOptions,
  WsmtxcaService,
} from "./services/wsmtxca";
export { createWsmtxcaService } from "./services/wsmtxca";
