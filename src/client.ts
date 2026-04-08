import { assertArcaClientConfig, normalizeArcaClientConfig } from "./config";
import type { ArcaClientConfig } from "./internal/types";
import { createPadronService, type PadronService } from "./services/padron";
import { createWsfeService, type WsfeService } from "./services/wsfe";
import { createWsmtxcaService, type WsmtxcaService } from "./services/wsmtxca";
import { createSoapTransport } from "./soap";
import { createWsaaAuthModule } from "./wsaa";

export type ArcaClient = {
  config: ArcaClientConfig;
  wsfe: WsfeService;
  wsmtxca: WsmtxcaService;
  padron: PadronService;
};

export function createArcaClient(config: ArcaClientConfig): ArcaClient {
  assertArcaClientConfig(config);
  const normalizedConfig = normalizeArcaClientConfig(config);

  const auth = createWsaaAuthModule({ config: normalizedConfig });
  const soap = createSoapTransport({ config: normalizedConfig });

  return {
    config: normalizedConfig,
    wsfe: createWsfeService({ config: normalizedConfig, auth, soap }),
    wsmtxca: createWsmtxcaService({ config: normalizedConfig, auth, soap }),
    padron: createPadronService({ config: normalizedConfig, auth, soap }),
  };
}
