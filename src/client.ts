import { assertArcaClientConfig, normalizeArcaClientConfig } from "./config";
import { createArcaLogger } from "./internal/logger";
import type { ArcaClientConfig } from "./internal/types";
import { createPadronService, type PadronService } from "./services/padron";
import { createWsfeService, type WsfeService } from "./services/wsfe";
import { createWsmtxcaService, type WsmtxcaService } from "./services/wsmtxca";
import { createSoapTransport } from "./soap";
import { createWsaaAuthModule } from "./wsaa";

/** Fully wired ARCA client with access to all service modules. */
export type ArcaClient = {
  config: ArcaClientConfig;
  wsfe: WsfeService;
  wsmtxca: WsmtxcaService;
  padron: PadronService;
};

/**
 * Creates an ARCA client from the given configuration.
 * Validates the config, wires WSAA authentication and SOAP transport,
 * and returns an object with `.wsfe`, `.wsmtxca`, and `.padron` service modules.
 *
 * @throws {ArcaConfigurationError} When the config is missing or invalid.
 */
export function createArcaClient(config: ArcaClientConfig): ArcaClient {
  assertArcaClientConfig(config);
  const normalizedConfig = normalizeArcaClientConfig(config);
  const logger = createArcaLogger(normalizedConfig.logger);

  const auth = createWsaaAuthModule({ config: normalizedConfig, logger });
  const soap = createSoapTransport({ config: normalizedConfig, logger });

  return {
    config: normalizedConfig,
    wsfe: createWsfeService({ config: normalizedConfig, auth, soap }),
    wsmtxca: createWsmtxcaService({ config: normalizedConfig, auth, soap }),
    padron: createPadronService({ config: normalizedConfig, auth, soap }),
  };
}
