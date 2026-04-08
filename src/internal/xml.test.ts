import { describe, expect, it } from "vitest";
import type { ArcaSoapFaultError } from "../errors";
import {
  buildSoapEnvelope,
  getSingleBodyEntry,
  parseSoapBody,
  parseXmlDocument,
  pruneUndefinedDeep,
} from "./xml";

describe("xml helpers", () => {
  it("builds SOAP envelopes with default namespaces and prunes undefined values", () => {
    const xml = buildSoapEnvelope("1.2", "FECompConsultar", "urn:test", {
      keep: "value",
      drop: undefined,
      nested: {
        keep: true,
        drop: undefined,
      },
      items: [{ code: "A" }, undefined, { code: "B", optional: undefined }],
    });

    expect(xml).toContain("soap12:Envelope");
    expect(xml).toContain('xmlns="urn:test"');
    expect(xml).toContain("<keep>value</keep>");
    expect(xml).toContain("<code>A</code>");
    expect(xml).not.toContain("<drop>");
    expect(xml).not.toContain("<optional>");
  });

  it("builds SOAP envelopes with prefixed namespaces when requested", () => {
    const xml = buildSoapEnvelope(
      "1.1",
      "autorizarComprobanteRequest",
      "urn:wsmtxca",
      { authRequest: { token: "token" } },
      { namespaceMode: "prefix" }
    );

    expect(xml).toContain("soap:Envelope");
    expect(xml).toContain("tns:autorizarComprobanteRequest");
    expect(xml).toContain('xmlns:tns="urn:wsmtxca"');
  });

  it("parses SOAP bodies and extracts a single body entry", () => {
    const body = parseSoapBody(
      '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><LoginResponse><LoginResult><token>abc</token></LoginResult></LoginResponse></soap:Body></soap:Envelope>'
    );
    const [entryName, entryValue] =
      getSingleBodyEntry<Record<string, unknown>>(body);

    expect(entryName).toBe("LoginResponse");
    expect(entryValue).toEqual({
      LoginResult: {
        token: "abc",
      },
    });
  });

  it("throws structured SOAP faults for SOAP 1.1 and SOAP 1.2 responses", () => {
    expect(() =>
      parseSoapBody(
        '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultcode>soap:Server</faultcode><faultstring>No existe</faultstring></soap:Fault></soap:Body></soap:Envelope>'
      )
    ).toThrowError(
      expect.objectContaining<Partial<ArcaSoapFaultError>>({
        name: "ArcaSoapFaultError",
        message: "No existe",
        faultCode: "soap:Server",
      })
    );

    expect(() =>
      parseSoapBody(
        '<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><soap12:Fault><soap12:Code><soap12:Value>soap12:Sender</soap12:Value></soap12:Code><soap12:Reason><soap12:Text>Bad request</soap12:Text></soap12:Reason></soap12:Fault></soap12:Body></soap12:Envelope>'
      )
    ).toThrowError(
      expect.objectContaining<Partial<ArcaSoapFaultError>>({
        name: "ArcaSoapFaultError",
        message: "Bad request",
        faultCode: "soap12:Sender",
      })
    );
  });

  it("rejects malformed SOAP responses and multiple body entries", () => {
    expect(() => parseSoapBody("<Envelope />")).toThrowError(
      expect.objectContaining<Partial<ArcaSoapFaultError>>({
        message: "Invalid SOAP response: missing body",
      })
    );

    expect(() =>
      getSingleBodyEntry({
        first: { ok: true },
        second: { ok: false },
      })
    ).toThrowError(
      expect.objectContaining<Partial<ArcaSoapFaultError>>({
        message: "Invalid SOAP response: expected a single body entry, got 2",
      })
    );
  });

  it("parses XML documents and recursively drops undefined values", () => {
    expect(
      parseXmlDocument<{ root: { value: string } }>(
        "<root><value>ok</value></root>"
      )
    ).toEqual({
      root: {
        value: "ok",
      },
    });

    expect(
      pruneUndefinedDeep({
        keep: "value",
        nested: {
          keep: 1,
          drop: undefined,
        },
        items: [undefined, { keep: true, drop: undefined }],
      })
    ).toEqual({
      keep: "value",
      nested: {
        keep: 1,
      },
      items: [{ keep: true }],
    });
  });
});
