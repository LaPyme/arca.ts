import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import https from "node:https";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArcaTransportError } from "../errors";
import { postXml } from "./http";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("postXml", () => {
  it("sends SOAP requests and resolves successful responses", async () => {
    const capturedOptions: https.RequestOptions[] = [];
    vi.spyOn(https, "request").mockImplementation(
      createMockRequest({
        statusCode: 200,
        responseBody: "<soap>ok</soap>",
        captureRequestOptions: capturedOptions,
      })
    );

    const result = await postXml({
      url: "https://example.com/ws?ticket=1",
      body: "<request />",
      contentType: 'text/xml; charset="utf-8"',
      soapAction: "urn:test-action",
    });

    expect(result).toBe("<soap>ok</soap>");
    expect(capturedOptions[0]).toEqual(
      expect.objectContaining({
        protocol: "https:",
        hostname: "example.com",
        path: "/ws?ticket=1",
        method: "POST",
        headers: expect.objectContaining({
          Accept: "text/xml, application/soap+xml",
          "Content-Type": 'text/xml; charset="utf-8"',
          SOAPAction: '"urn:test-action"',
        }),
      })
    );
  });

  it("switches the HTTP agent when legacy TLS mode is enabled", async () => {
    const capturedOptions: https.RequestOptions[] = [];
    vi.spyOn(https, "request").mockImplementation(
      createMockRequest({
        statusCode: 200,
        responseBody: "<soap>ok</soap>",
        captureRequestOptions: capturedOptions,
      })
    );

    await postXml({
      url: "https://example.com/ws",
      body: "<request />",
      contentType: 'text/xml; charset="utf-8"',
      useLegacyTlsSecurityLevel0: false,
    });
    await postXml({
      url: "https://example.com/ws",
      body: "<request />",
      contentType: 'text/xml; charset="utf-8"',
      useLegacyTlsSecurityLevel0: true,
    });

    expect(capturedOptions[0]?.agent).toBeDefined();
    expect(capturedOptions[1]?.agent).toBeDefined();
    expect(capturedOptions[0]?.agent).not.toBe(capturedOptions[1]?.agent);
  });

  it("resolves XML fault bodies even on HTTP 500", async () => {
    const responseBody =
      '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultcode>soap:Server</faultcode><faultstring>No existe</faultstring></soap:Fault></soap:Body></soap:Envelope>';

    vi.spyOn(https, "request").mockImplementation(
      createMockRequest({
        statusCode: 500,
        headers: { "content-type": "text/xml; charset=utf-8" },
        responseBody,
      })
    );

    await expect(
      postXml({
        url: "https://example.com/ws",
        body: "<request />",
        contentType: 'text/xml; charset="utf-8"',
      })
    ).resolves.toBe(responseBody);
  });

  it("keeps non-XML HTTP 500 responses as transport errors", async () => {
    vi.spyOn(https, "request").mockImplementation(
      createMockRequest({
        statusCode: 500,
        headers: { "content-type": "text/plain; charset=utf-8" },
        responseBody: "upstream exploded",
      })
    );

    await expect(
      postXml({
        url: "https://example.com/ws",
        body: "<request />",
        contentType: 'text/xml; charset="utf-8"',
      })
    ).rejects.toMatchObject({
      name: "ArcaTransportError",
      statusCode: 500,
      responseBody: "upstream exploded",
    });
  });

  it("rejects when the response stream errors", async () => {
    vi.spyOn(https, "request").mockImplementation(
      createMockRequest({
        statusCode: 200,
        responseBody: "<partial",
        failWithResponseError: new Error("socket closed"),
      })
    );

    await expect(
      postXml({
        url: "https://example.com/ws",
        body: "<request />",
        contentType: 'text/xml; charset="utf-8"',
      })
    ).rejects.toMatchObject({
      name: "ArcaTransportError",
      statusCode: 200,
      responseBody: "<partial",
    });
  });

  it("rejects when the response is aborted", async () => {
    vi.spyOn(https, "request").mockImplementation(
      createMockRequest({
        statusCode: 200,
        responseBody: "<partial",
        abortResponse: true,
      })
    );

    await expect(
      postXml({
        url: "https://example.com/ws",
        body: "<request />",
        contentType: 'text/xml; charset="utf-8"',
      })
    ).rejects.toMatchObject({
      name: "ArcaTransportError",
      message: "ARCA HTTP response was aborted",
      statusCode: 200,
      responseBody: "<partial",
    });
  });

  it("rejects when the request fails before a response arrives", async () => {
    vi.spyOn(https, "request").mockImplementation(
      createMockRequest({
        statusCode: 200,
        responseBody: "",
        failWithRequestError: new Error("connection refused"),
      })
    );

    await expect(
      postXml({
        url: "https://example.com/ws",
        body: "<request />",
        contentType: 'text/xml; charset="utf-8"',
      })
    ).rejects.toMatchObject({
      name: "ArcaTransportError",
      message: "ARCA HTTP request failed: connection refused",
    });
  });

  it("rejects when the request times out", async () => {
    vi.spyOn(https, "request").mockImplementation(
      createMockRequest({
        statusCode: 200,
        responseBody: "",
        triggerTimeout: true,
      })
    );

    const error = await postXml({
      url: "https://example.com/ws",
      body: "<request />",
      contentType: 'text/xml; charset="utf-8"',
    }).catch((caughtError) => caughtError);

    expect(error).toBeInstanceOf(ArcaTransportError);
    assert.match(
      (error as ArcaTransportError).message,
      /ARCA HTTP request timed out after 30000ms/
    );
  });
});

function createMockRequest(options: {
  statusCode: number;
  headers?: Record<string, string>;
  responseBody: string;
  captureRequestOptions?: https.RequestOptions[];
  failWithRequestError?: Error;
  failWithResponseError?: Error;
  abortResponse?: boolean;
  triggerTimeout?: boolean;
}): typeof https.request {
  return ((
    requestOptions: https.RequestOptions,
    callback?: (response: EventEmitter) => void
  ) => {
    options.captureRequestOptions?.push(requestOptions);

    let timeoutListener: (() => void) | undefined;
    const request = new EventEmitter() as EventEmitter & {
      write: (chunk: string | Buffer) => void;
      end: () => void;
      destroy: (error?: Error) => void;
      setTimeout: (timeoutMs: number, listener?: () => void) => void;
    };

    request.write = () => undefined;
    request.destroy = (error?: Error) => {
      if (error) {
        process.nextTick(() => request.emit("error", error));
      }
    };
    request.setTimeout = (_timeoutMs: number, listener?: () => void) => {
      timeoutListener = listener;
    };
    request.end = () => {
      if (options.failWithRequestError) {
        process.nextTick(() =>
          request.emit("error", options.failWithRequestError)
        );
        return;
      }

      if (options.triggerTimeout) {
        process.nextTick(() => timeoutListener?.());
        return;
      }

      const response = new EventEmitter() as EventEmitter & {
        statusCode?: number;
        headers: Record<string, string>;
      };

      response.statusCode = options.statusCode;
      response.headers = options.headers ?? {};

      process.nextTick(() => {
        callback?.(response);
        response.emit("data", Buffer.from(options.responseBody, "utf8"));
        if (options.failWithResponseError) {
          response.emit("error", options.failWithResponseError);
          return;
        }
        if (options.abortResponse) {
          response.emit("aborted");
          return;
        }
        response.emit("end");
      });
    };

    return request as never;
  }) as unknown as typeof https.request;
}
