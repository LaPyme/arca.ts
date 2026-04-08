import { ArcaSoapFaultError } from "../errors";
import type { SoapTransport } from "../soap";
import type {
  ArcaClientConfig,
  ArcaPadronServiceName,
} from "../internal/types";
import type { WsaaAuthModule } from "../wsaa";

export type PadronService = {
  getTaxpayerDetails(taxId: number | string): Promise<unknown>;
  getTaxIdByDocument(documentNumber: number | string): Promise<unknown>;
};

export type CreatePadronServiceOptions = {
  config: ArcaClientConfig;
  auth: WsaaAuthModule;
  soap: SoapTransport;
};

export function createPadronService(
  options: CreatePadronServiceOptions
): PadronService {
  return {
    async getTaxpayerDetails(taxId) {
      return await executePadronOperation(
        options,
        "padron-a5",
        "getPersona_v2",
        {
          idPersona: Number.parseInt(String(taxId), 10),
        }
      );
    },
    async getTaxIdByDocument(documentNumber) {
      const result = await executePadronOperation(
        options,
        "padron-a13",
        "getIdPersonaListByDocumento",
        {
          documento: String(documentNumber),
        }
      );
      return (result as Record<string, unknown>)?.idPersona ?? result;
    },
  };
}

async function executePadronOperation(
  options: CreatePadronServiceOptions,
  service: ArcaPadronServiceName,
  operation: string,
  body: Record<string, unknown>
) {
  const auth = await options.auth.login(
    service === "padron-a5"
      ? "ws_sr_constancia_inscripcion"
      : "ws_sr_padron_a13"
  );

  try {
    const response = await options.soap.execute<
      Record<string, unknown>,
      Record<string, unknown>
    >({
      service,
      operation,
      bodyElementNamespaceMode: "prefix",
      body: {
        token: auth.token,
        sign: auth.sign,
        cuitRepresentada: Number.parseInt(options.config.taxId, 10),
        ...body,
      },
    });

    const operationResponse = response.result as Record<string, unknown>;

    if (operation === "getPersona_v2") {
      return operationResponse.personaReturn ?? null;
    }

    if (operation === "getIdPersonaListByDocumento") {
      return operationResponse.idPersonaListReturn ?? null;
    }

    return operationResponse.return ?? null;
  } catch (error) {
    if (
      error instanceof ArcaSoapFaultError &&
      error.message.toLowerCase().includes("no existe")
    ) {
      return null;
    }

    throw error;
  }
}
