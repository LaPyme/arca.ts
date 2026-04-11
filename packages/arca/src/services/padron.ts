import { ArcaSoapFaultError } from "../errors";
import type {
  ArcaClientConfig,
  ArcaPadronServiceName,
} from "../internal/types";
import type { SoapTransport } from "../soap";
import type { WsaaAuthModule } from "../wsaa";

/** Result of a taxpayer lookup via Padron A5. */
export type PadronTaxpayerResult = {
  taxId: string;
  personType?: string;
  name?: string;
  raw: Record<string, unknown>;
};

/** Result of a tax ID lookup by document number via Padron A13. */
export type PadronTaxIdLookupResult = {
  taxIds: string[];
  raw: Record<string, unknown>;
};

/** Padron taxpayer registry service. */
export type PadronService = {
  /** Looks up taxpayer details by CUIT. Returns `null` if the taxpayer does not exist. */
  getTaxpayerDetails(
    taxId: number | string
  ): Promise<PadronTaxpayerResult | null>;
  /** Looks up CUITs associated with a document number. Returns `null` if not found. */
  getTaxIdByDocument(
    documentNumber: number | string
  ): Promise<PadronTaxIdLookupResult | null>;
};

export type CreatePadronServiceOptions = {
  config: ArcaClientConfig;
  auth: WsaaAuthModule;
  soap: SoapTransport;
};

/** Creates a Padron service instance wired with authentication and SOAP transport. */
export function createPadronService(
  options: CreatePadronServiceOptions
): PadronService {
  return {
    async getTaxpayerDetails(taxId) {
      const raw = await executePadronOperation(
        options,
        "padron-a5",
        "getPersona_v2",
        {
          idPersona: Number.parseInt(String(taxId), 10),
        }
      );
      if (!raw) {
        return null;
      }
      const record = raw as Record<string, unknown>;
      const datosGenerales = record.datosGenerales as
        | Record<string, unknown>
        | undefined;
      return {
        taxId: String(record.idPersona ?? ""),
        ...(record.tipoPersona === undefined
          ? {}
          : { personType: String(record.tipoPersona) }),
        ...(datosGenerales ? { name: extractPadronName(datosGenerales) } : {}),
        raw: record,
      };
    },
    async getTaxIdByDocument(documentNumber) {
      const raw = await executePadronOperation(
        options,
        "padron-a13",
        "getIdPersonaListByDocumento",
        {
          documento: String(documentNumber),
        }
      );
      if (!raw) {
        return null;
      }
      const record = raw as Record<string, unknown>;
      const idPersona = record.idPersona;
      const taxIds = Array.isArray(idPersona)
        ? idPersona.map(String)
        : idPersona === undefined
          ? []
          : [String(idPersona)];
      return {
        taxIds,
        raw: record,
      };
    },
  };
}

function extractPadronName(
  datosGenerales: Record<string, unknown>
): string | undefined {
  if (typeof datosGenerales.razonSocial === "string") {
    return datosGenerales.razonSocial;
  }
  const nombre = datosGenerales.nombre;
  const apellido = datosGenerales.apellido;
  if (typeof apellido === "string" && typeof nombre === "string") {
    return `${apellido} ${nombre}`.trim();
  }
  if (typeof apellido === "string") {
    return apellido;
  }
  if (typeof nombre === "string") {
    return nombre;
  }
  return undefined;
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
      // Public Padron A5/A13 WSDLs expose only a generic validation fault, so
      // there is no documented not-found-specific fault code to match here.
      // Keep the current message fallback, but treat it as fragile.
      error.message.toLowerCase().includes("no existe")
    ) {
      return null;
    }

    throw error;
  }
}
