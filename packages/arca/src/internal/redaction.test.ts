import { describe, expect, it } from "vitest";
import {
  createResponseBodyDiagnostic,
  createSafeErrorDiagnostic,
  MAX_DIAGNOSTIC_PREVIEW_LENGTH,
  redactDiagnosticPreview,
} from "./redaction";

describe("diagnostic redaction", () => {
  it("redacts qualified, unqualified, self-closing, and incomplete credentials", () => {
    const diagnostic = redactDiagnosticPreview(
      '<Token source="private">token-value</Token><wsaa:Sign>sign-value</wsaa:Sign><Token value="attribute-secret"/><ns:Sign>incomplete-sign'
    );

    expect(diagnostic).toBe(
      "<Token>[REDACTED]</Token><wsaa:Sign>[REDACTED]</wsaa:Sign><Token>[REDACTED]</Token><ns:Sign>[REDACTED]"
    );
    expect(diagnostic).not.toMatch(
      /token-value|sign-value|attribute-secret|incomplete-sign/
    );
  });

  it("never exceeds the global preview limit", () => {
    const body = `<Token>secret</Token>${"x".repeat(10_000)}`;
    const diagnostic = createResponseBodyDiagnostic(body, 50_000);

    expect(diagnostic.responseBodyLength).toBe(body.length);
    expect(diagnostic.responseBodyPreview).toHaveLength(
      MAX_DIAGNOSTIC_PREVIEW_LENGTH
    );
    expect(diagnostic.responseBodyPreview).toMatch(
      /^<Token>\[REDACTED\]<\/Token>/
    );
    expect(diagnostic.responseBodyPreview).not.toContain("secret");
  });

  it("extracts only safe scalar error metadata", () => {
    const cause = new Error("cause with private detail");
    const diagnostic = createSafeErrorDiagnostic({
      name: "ArcaTransportError",
      code: "ARCA_TRANSPORT_ERROR",
      statusCode: 500,
      contentType: "text/xml",
      responseBodyLength: 42,
      responseBodyPreview: "<Token>token-value</Token>",
      faultCode: "soap:Server",
      cause,
      detail: { Token: "token-value" },
      responseBody: "full private body",
    });

    expect(diagnostic).toEqual({
      errorName: "ArcaTransportError",
      errorCode: "ARCA_TRANSPORT_ERROR",
      statusCode: 500,
      contentType: "text/xml",
      responseBodyLength: 42,
      responseBodyPreview: "<Token>[REDACTED]</Token>",
      faultCode: "soap:Server",
    });
    expect(JSON.stringify(diagnostic)).not.toMatch(
      /token-value|private detail|full private body/
    );
  });
});
