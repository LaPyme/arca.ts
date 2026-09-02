import { describe, expect, it } from "vitest";
import {
  ArcaConfigurationError,
  ArcaError,
  ArcaInputError,
  ArcaInvalidSoapResponseError,
  ArcaServiceError,
  ArcaSoapFaultError,
  ArcaTransportError,
} from "./errors";

describe("errors", () => {
  it("assigns names, codes, and metadata for all ARCA error classes", () => {
    const cause = new Error("root cause");

    const baseError = new ArcaError("base", "ARCA_BASE", { cause });
    const configError = new ArcaConfigurationError("config", { cause });
    const inputError = new ArcaInputError("input", {
      cause,
      detail: { field: "voucherDate" },
    });
    const transportError = new ArcaTransportError("transport", {
      cause,
      statusCode: 500,
      contentType: "text/xml",
      responseBodyLength: 9,
      responseBodyPreview: "<fault />",
    });
    const invalidSoapResponse = new ArcaInvalidSoapResponseError(
      "invalid soap",
      {
        cause,
        service: "wsfe",
        operation: "FECompConsultar",
        endpointUrl: "https://example.com/ws",
        statusCode: 200,
        contentType: "text/html",
        responseBodyLength: 42,
        responseBodyPreview: "<html />",
      }
    );
    const soapFault = new ArcaSoapFaultError("soap", {
      cause,
      faultCode: "soap:Server",
    });
    const serviceError = new ArcaServiceError("service", {
      cause,
      serviceCode: 10_017,
      service: "wsfe",
      operation: "FECAESolicitar",
      result: "R",
      resultLevel: "detail",
      results: { header: "R", detail: "R" },
      issues: [
        {
          service: "wsfe",
          operation: "FECAESolicitar",
          source: "observation",
          category: "business",
          code: "10017",
          message: "Fecha inválida",
        },
      ],
    });

    expect(baseError).toMatchObject({
      name: "ArcaError",
      code: "ARCA_BASE",
      message: "base",
      cause,
    });
    expect(configError).toMatchObject({
      name: "ArcaConfigurationError",
      code: "ARCA_CONFIGURATION_ERROR",
    });
    expect(inputError).toMatchObject({
      name: "ArcaInputError",
      code: "ARCA_INPUT_ERROR",
      detail: { field: "voucherDate" },
    });
    expect(transportError).toMatchObject({
      name: "ArcaTransportError",
      code: "ARCA_TRANSPORT_ERROR",
      statusCode: 500,
      contentType: "text/xml",
      responseBodyLength: 9,
      responseBodyPreview: "<fault />",
    });
    expect(invalidSoapResponse).toMatchObject({
      name: "ArcaInvalidSoapResponseError",
      code: "ARCA_INVALID_SOAP_RESPONSE",
      service: "wsfe",
      operation: "FECompConsultar",
      endpointUrl: "https://example.com/ws",
      statusCode: 200,
      contentType: "text/html",
      responseBodyLength: 42,
      responseBodyPreview: "<html />",
    });
    expect(soapFault).toMatchObject({
      name: "ArcaSoapFaultError",
      code: "ARCA_SOAP_FAULT",
      faultCode: "soap:Server",
    });
    expect(serviceError).toMatchObject({
      name: "ArcaServiceError",
      code: "ARCA_SERVICE_ERROR",
      serviceCode: 10_017,
      service: "wsfe",
      operation: "FECAESolicitar",
      result: "R",
      resultLevel: "detail",
      results: { header: "R", detail: "R" },
      issues: [
        {
          service: "wsfe",
          operation: "FECAESolicitar",
          source: "observation",
          category: "business",
          code: "10017",
          message: "Fecha inválida",
        },
      ],
    });
  });

  it("bounds and redacts every public response preview", () => {
    const sensitiveBody = `<ns:Token audience="private">token-value</ns:Token><Sign>sign-value</Sign>${"x".repeat(5000)}`;
    const transportError = new ArcaTransportError("transport", {
      responseBodyLength: sensitiveBody.length,
      responseBodyPreview: sensitiveBody,
    });
    const invalidSoapResponse = new ArcaInvalidSoapResponseError(
      "invalid soap",
      {
        responseBodyLength: sensitiveBody.length,
        responseBodyPreview: sensitiveBody,
      }
    );

    for (const error of [transportError, invalidSoapResponse]) {
      expect(error.responseBodyPreview).toHaveLength(4096);
      expect(error.responseBodyPreview).toContain(
        "<ns:Token>[REDACTED]</ns:Token>"
      );
      expect(error.responseBodyPreview).toContain("<Sign>[REDACTED]</Sign>");
      expect(JSON.stringify(error)).not.toContain("token-value");
      expect(JSON.stringify(error)).not.toContain("sign-value");
    }

    expect(transportError).not.toHaveProperty("responseBody");
    expect(invalidSoapResponse).not.toHaveProperty("parsedDetail");

    const soapFault = new ArcaSoapFaultError(
      `<Token>token-value</Token><Sign>sign-value</Sign>${"x".repeat(5000)}`,
      { faultCode: "<Token>fault-code-token</Token>" }
    );
    expect(soapFault.message).toHaveLength(4096);
    expect(soapFault.message).toContain("<Token>[REDACTED]</Token>");
    expect(soapFault.message).toContain("<Sign>[REDACTED]</Sign>");
    expect(soapFault.faultCode).toBe("<Token>[REDACTED]</Token>");
    expect(JSON.stringify(soapFault)).not.toMatch(
      /token-value|sign-value|fault-code-token/
    );
  });
});
