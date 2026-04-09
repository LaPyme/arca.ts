import { getArcaServiceConfig } from "../config";
import { ArcaSoapFaultError } from "../errors";
import { postXml } from "../internal/http";
import type { ArcaLogger } from "../internal/logger";
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
  logger?: ArcaLogger;
};

export function createSoapTransport(
  options: CreateSoapTransportOptions
): SoapTransport {
  return {
    async execute<TBody, TResult>(request: ArcaSoapExecutionOptions<TBody>) {
      const serviceConfig = getArcaServiceConfig(request.service);
      const url = serviceConfig.endpoint[options.config.environment];
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
      const startedAt = Date.now();

      options.logger?.debug("Sending ARCA SOAP request", {
        service: request.service,
        operation: request.operation,
        url,
      });

      try {
        const responseXml = await postXml({
          url,
          body: xml,
          contentType,
          soapAction:
            serviceConfig.soapVersion === "1.1" ? soapAction : undefined,
          useLegacyTlsSecurityLevel0:
            options.config.environment === "production" &&
            serviceConfig.useLegacyTlsSecurityLevel0 === true,
          timeout: options.config.timeout,
          retries: options.config.retries,
          retryDelay: options.config.retryDelay,
          logger: options.logger,
          service: request.service,
          operation: request.operation,
        });

        options.logger?.debug("Received ARCA SOAP response", {
          service: request.service,
          operation: request.operation,
          durationMs: Date.now() - startedAt,
        });

        const soapBody = parseSoapBody(responseXml);
        const [, result] =
          getSingleBodyEntry<Record<string, unknown>>(soapBody);

        return {
          service: request.service,
          operation: request.operation,
          raw: responseXml,
          result: result as TResult,
        };
      } catch (error) {
        if (error instanceof ArcaSoapFaultError) {
          options.logger?.error("ARCA SOAP fault response", {
            service: request.service,
            operation: request.operation,
            url,
            faultCode: error.faultCode,
            error,
          });
        }

        throw error;
      }
    },
  };
}
