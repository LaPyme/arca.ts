export type { ArcaClient } from "./client";
// biome-ignore lint/performance/noBarrelFile: package entrypoint re-exports runtime client factory
export { createArcaClient } from "./client";
export type { CreateArcaClientConfigFromEnvOptions } from "./config";
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
  PadronTaxIdLookupResult,
  PadronTaxpayerResult,
} from "./services/padron";
export { createPadronService } from "./services/padron";
export type {
  CreateWsfeServiceOptions,
  WsfeAssociatedVoucher,
  WsfeAuthorizationResult,
  WsfeBuyer,
  WsfeOptionalField,
  WsfeSalesPoint,
  WsfeService,
  WsfeTax,
  WsfeVatRate,
  WsfeVoucherInfo,
  WsfeVoucherInput,
} from "./services/wsfe";
export { createWsfeService } from "./services/wsfe";
export type {
  CreateWsmtxcaServiceOptions,
  WsmtxcaAuthorizationResult,
  WsmtxcaLastAuthorizedVoucherResult,
  WsmtxcaService,
  WsmtxcaVoucherLookupResult,
} from "./services/wsmtxca";
export { createWsmtxcaService } from "./services/wsmtxca";
