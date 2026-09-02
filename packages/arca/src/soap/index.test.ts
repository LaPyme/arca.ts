import { afterEach, describe, expect, it, vi } from "vitest";

const mockPostXml = vi.hoisted(() => vi.fn());

vi.mock("../internal/http", () => ({
  postXmlWithMetadata: mockPostXml,
}));

import { createArcaLogger } from "../internal/logger";
import { createSoapTransport } from "./index";

afterEach(() => {
  vi.clearAllMocks();
});

describe("createSoapTransport", () => {
  it("executes SOAP 1.2 operations with content-type actions", async () => {
    mockPostXml.mockResolvedValueOnce({
      body: '<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><FEParamGetPtosVentaResponse><FEParamGetPtosVentaResult><ResultGet><PtoVenta><Nro>3</Nro></PtoVenta></ResultGet></FEParamGetPtosVentaResult></FEParamGetPtosVentaResponse></soap12:Body></soap12:Envelope>',
      statusCode: 200,
      contentType: "application/soap+xml; charset=utf-8",
    });

    const transport = createSoapTransport({
      config: {
        taxId: "20123456789",
        certificatePem: "cert",
        privateKeyPem: "key",
        environment: "production",
      },
    });

    const response = await transport.execute({
      service: "wsfe",
      operation: "FEParamGetPtosVenta",
      body: {
        Auth: {
          Token: "token",
        },
      },
    });

    expect(response).toMatchObject({
      service: "wsfe",
      operation: "FEParamGetPtosVenta",
      result: {
        FEParamGetPtosVentaResult: {
          ResultGet: {
            PtoVenta: {
              Nro: "3",
            },
          },
        },
      },
    });
    expect(mockPostXml).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
        contentType:
          'application/soap+xml; charset=utf-8; action="http://ar.gov.afip.dif.FEV1/FEParamGetPtosVenta"',
        soapAction: undefined,
        useLegacyTlsSecurityLevel0: true,
      })
    );
  });

  it("executes SOAP 1.1 operations with explicit SOAPAction headers", async () => {
    mockPostXml.mockResolvedValueOnce({
      body: '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><loginCmsResponse><loginCmsReturn>ok</loginCmsReturn></loginCmsResponse></soap:Body></soap:Envelope>',
      statusCode: 200,
      contentType: "text/xml; charset=utf-8",
    });

    const transport = createSoapTransport({
      config: {
        taxId: "20123456789",
        certificatePem: "cert",
        privateKeyPem: "key",
        environment: "test",
      },
    });

    const response = await transport.execute({
      service: "wsaa",
      operation: "loginCms",
      body: { in0: "signed-cms" },
    });

    expect(response.result).toEqual({
      loginCmsReturn: "ok",
    });
    expect(mockPostXml).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
        contentType: 'text/xml; charset="utf-8"',
        soapAction: "",
        useLegacyTlsSecurityLevel0: false,
      })
    );
    expect(mockPostXml.mock.calls[0]?.[0]?.body).toContain("<loginCms ");
  });

  it("allows fiscal operations to disable configured transport retries", async () => {
    mockPostXml.mockResolvedValueOnce({
      body: '<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><FECAESolicitarResponse><FECAESolicitarResult /></FECAESolicitarResponse></soap12:Body></soap12:Envelope>',
      statusCode: 200,
      contentType: "application/soap+xml; charset=utf-8",
    });

    const transport = createSoapTransport({
      config: {
        taxId: "20123456789",
        certificatePem: "cert",
        privateKeyPem: "key",
        environment: "test",
        retries: 3,
      },
    });

    await transport.execute({
      service: "wsfe",
      operation: "FECAESolicitar",
      retries: 0,
      body: {},
    });

    expect(mockPostXml).toHaveBeenCalledWith(
      expect.objectContaining({ retries: 0 })
    );
  });

  it("throws invalid SOAP response errors with HTTP metadata and sanitized previews", async () => {
    const log = vi.fn();
    const responseBody =
      "<html><body><Token>secret-token</Token><Sign>secret-sign</Sign></body></html>";
    mockPostXml.mockResolvedValueOnce({
      body: responseBody,
      statusCode: 200,
      contentType: "text/html; charset=utf-8",
    });

    const transport = createSoapTransport({
      config: {
        taxId: "20123456789",
        certificatePem: "cert",
        privateKeyPem: "key",
        environment: "production",
      },
      logger: createArcaLogger({ level: "error", log }),
    });

    const error = await transport
      .execute({
        service: "wsfe",
        operation: "FEParamGetPtosVenta",
        body: {},
      })
      .catch((caughtError: unknown) => caughtError);

    expect(error).toMatchObject({
      name: "ArcaInvalidSoapResponseError",
      service: "wsfe",
      operation: "FEParamGetPtosVenta",
      endpointUrl: "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
      statusCode: 200,
      contentType: "text/html; charset=utf-8",
      responseBodyPreview:
        "<html><body><Token>[REDACTED]</Token><Sign>[REDACTED]</Sign></body></html>",
    });
    expect(error).not.toHaveProperty("parsedDetail");
    expect(JSON.stringify(error)).not.toMatch(/secret-token|secret-sign/);
    expect(log).toHaveBeenCalledWith(
      "error",
      "ARCA invalid SOAP response",
      expect.objectContaining({
        service: "wsfe",
        operation: "FEParamGetPtosVenta",
        errorName: "ArcaInvalidSoapResponseError",
        errorCode: "ARCA_INVALID_SOAP_RESPONSE",
        statusCode: 200,
        responseBodyLength: responseBody.length,
        responseBodyPreview:
          "<html><body><Token>[REDACTED]</Token><Sign>[REDACTED]</Sign></body></html>",
      })
    );
    const loggerMetadata = log.mock.calls[0]?.[2];
    expect(loggerMetadata).not.toHaveProperty("error");
    expect(JSON.stringify(loggerMetadata)).not.toMatch(
      /secret-token|secret-sign/
    );
  });

  it("omits parsed SOAP fault trees from errors and logger metadata", async () => {
    const log = vi.fn();
    mockPostXml.mockResolvedValueOnce({
      body: '<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultcode>soap:Server</faultcode><faultstring>Rejected</faultstring><detail><ns:Token xmlns:ns="urn:test">token-value</ns:Token><Sign>sign-value</Sign></detail></soap:Fault></soap:Body></soap:Envelope>',
      statusCode: 500,
      contentType: "text/xml; charset=utf-8",
    });

    const transport = createSoapTransport({
      config: {
        taxId: "20123456789",
        certificatePem: "cert",
        privateKeyPem: "key",
        environment: "production",
      },
      logger: createArcaLogger({ level: "error", log }),
    });

    const error = await transport
      .execute({
        service: "wsfe",
        operation: "FEParamGetPtosVenta",
        body: {},
      })
      .catch((caughtError: unknown) => caughtError);

    expect(error).toMatchObject({
      name: "ArcaSoapFaultError",
      code: "ARCA_SOAP_FAULT",
      faultCode: "soap:Server",
    });
    expect(error).not.toHaveProperty("detail");
    expect(JSON.stringify(error)).not.toMatch(/token-value|sign-value/);
    expect(log).toHaveBeenCalledWith(
      "error",
      "ARCA SOAP fault response",
      expect.objectContaining({
        service: "wsfe",
        operation: "FEParamGetPtosVenta",
        errorName: "ArcaSoapFaultError",
        errorCode: "ARCA_SOAP_FAULT",
        faultCode: "soap:Server",
      })
    );
    expect(log.mock.calls[0]?.[2]).not.toHaveProperty("error");
    expect(JSON.stringify(log.mock.calls[0]?.[2])).not.toMatch(
      /token-value|sign-value/
    );
  });
});
