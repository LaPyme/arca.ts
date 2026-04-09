import { getArcaServiceConfig } from "../config";
import { postXml } from "../internal/http";
import type {
  ArcaClientConfig,
  ArcaSoapExecutionOptions,
  ArcaSoapResponse,
} from "../internal/types";
import {
  buildSoapEnvelope,
  getSingleBodyEntry,
  parseSoapBody,
} from "../internal/xml";

export type SoapTransport = {
  execute<TBody, TResult>(
    request: ArcaSoapExecutionOptions<TBody>
  ): Promise<ArcaSoapResponse<TResult>>;
};

export type CreateSoapTransportOptions = {
  config: ArcaClientConfig;
  fetchImplementation?: typeof fetch;
};

export function createSoapTransport(
  options: CreateSoapTransportOptions
): SoapTransport {
  return {
    async execute<TBody, TResult>(request: ArcaSoapExecutionOptions<TBody>) {
      const serviceConfig = getArcaServiceConfig(request.service);
      const soapActionOperation = request.operation;
      const bodyElementName = request.bodyElementName ?? request.operation;
      const soapAction = serviceConfig.usesEmptySoapAction
        ? ""
        : `${serviceConfig.soapActionBase}${soapActionOperation}`;
      const contentType =
        serviceConfig.soapVersion === "1.2"
          ? `application/soap+xml; charset=utf-8; action="${soapAction}"`
          : 'text/xml; charset="utf-8"';
      const xml = buildSoapEnvelope(
        serviceConfig.soapVersion,
        bodyElementName,
        serviceConfig.namespace,
        request.body as Record<string, unknown>,
        {
          namespaceMode: request.bodyElementNamespaceMode,
        }
      );
      const responseXml = await postXml({
        url: serviceConfig.endpoint[options.config.environment],
        body: xml,
        contentType,
        soapAction:
          serviceConfig.soapVersion === "1.1" ? soapAction : undefined,
        useLegacyTlsSecurityLevel0:
          options.config.environment === "production" &&
          serviceConfig.useLegacyTlsSecurityLevel0 === true,
      });

      const soapBody = parseSoapBody(responseXml);
      const [, result] = getSingleBodyEntry<Record<string, unknown>>(soapBody);

      return {
        service: request.service,
        operation: request.operation,
        raw: responseXml,
        result: result as TResult,
      };
    },
  };
}
