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
      responseBody: "<fault />",
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
        parsedDetail: { html: true },
      }
    );
    const soapFault = new ArcaSoapFaultError("soap", {
      cause,
      faultCode: "soap:Server",
      detail: { reason: "bad" },
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
      detail: { field: "CbteTipo" },
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
      responseBody: "<fault />",
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
      parsedDetail: { html: true },
    });
    expect(soapFault).toMatchObject({
      name: "ArcaSoapFaultError",
      code: "ARCA_SOAP_FAULT",
      faultCode: "soap:Server",
      detail: { reason: "bad" },
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
      detail: { field: "CbteTipo" },
    });
  });
});
