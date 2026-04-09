import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import https from "node:https";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArcaTransportError } from "../errors";
import { postXml } from "./http";
import { createArcaLogger } from "./logger";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
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

  it("retries transport failures with a fixed delay", async () => {
    vi.useFakeTimers();

    const log = vi.fn();
    const requestSpy = vi
      .spyOn(https, "request")
      .mockImplementationOnce(
        createMockRequest({
          statusCode: 200,
          responseBody: "",
          failWithRequestError: new Error("connection reset"),
        })
      )
      .mockImplementationOnce(
        createMockRequest({
          statusCode: 200,
          responseBody: "",
          failWithRequestError: new Error("connection reset"),
        })
      )
      .mockImplementationOnce(
        createMockRequest({
          statusCode: 200,
          responseBody: "<soap>ok</soap>",
        })
      );

    const responsePromise = postXml({
      url: "https://example.com/ws",
      body: "<request />",
      contentType: 'text/xml; charset="utf-8"',
      retries: 2,
      retryDelay: 500,
      logger: createArcaLogger({
        level: "warn",
        log,
      }),
      service: "wsfe",
      operation: "FEParamGetPtosVenta",
    });

    await Promise.resolve();
    expect(requestSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(499);
    expect(requestSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();
    expect(requestSpy).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(499);
    expect(requestSpy).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1);
    await expect(responsePromise).resolves.toBe("<soap>ok</soap>");
    expect(requestSpy).toHaveBeenCalledTimes(3);
    expect(log).toHaveBeenCalledWith(
      "warn",
      "Retrying ARCA request after transport failure (attempt 2/3)",
      expect.objectContaining({
        service: "wsfe",
        operation: "FEParamGetPtosVenta",
        attempt: 2,
        attempts: 3,
      })
    );
    expect(log).toHaveBeenCalledWith(
      "warn",
      "Retrying ARCA request after transport failure (attempt 3/3)",
      expect.objectContaining({
        service: "wsfe",
        operation: "FEParamGetPtosVenta",
        attempt: 3,
        attempts: 3,
      })
    );
  });

  it("does not retry XML responses returned with HTTP errors", async () => {
    const responseBody =
      '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultcode>soap:Server</faultcode><faultstring>No existe</faultstring></soap:Fault></soap:Body></soap:Envelope>';

    const requestSpy = vi.spyOn(https, "request").mockImplementation(
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
        retries: 2,
        retryDelay: 500,
      })
    ).resolves.toBe(responseBody);
    expect(requestSpy).toHaveBeenCalledTimes(1);
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

  it("uses the configured timeout for request timeouts", async () => {
    const capturedTimeoutMs: number[] = [];
    vi.spyOn(https, "request").mockImplementation(
      createMockRequest({
        statusCode: 200,
        responseBody: "",
        triggerTimeout: true,
        captureTimeoutMs: capturedTimeoutMs,
      })
    );

    const error = await postXml({
      url: "https://example.com/ws",
      body: "<request />",
      contentType: 'text/xml; charset="utf-8"',
      timeout: 1_234,
    }).catch((caughtError) => caughtError);

    expect(error).toBeInstanceOf(ArcaTransportError);
    expect(capturedTimeoutMs).toEqual([1_234]);
    assert.match(
      (error as ArcaTransportError).message,
      /ARCA HTTP request timed out after 1234ms/
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
  captureTimeoutMs?: number[];
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
    request.setTimeout = (timeoutMs: number, listener?: () => void) => {
      options.captureTimeoutMs?.push(timeoutMs);
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
