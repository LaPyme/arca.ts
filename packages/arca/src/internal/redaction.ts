export const MAX_DIAGNOSTIC_PREVIEW_LENGTH = 4096;

const MAX_DIAGNOSTIC_SCALAR_LENGTH = 512;
const SENSITIVE_XML_ELEMENT_NAME = "((?:[A-Za-z_][\\w.-]*:)?(?:Token|Sign))";
const PAIRED_SENSITIVE_XML_ELEMENT = new RegExp(
  `<${SENSITIVE_XML_ELEMENT_NAME}\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`,
  "gi"
);
const SELF_CLOSING_SENSITIVE_XML_ELEMENT = new RegExp(
  `<${SENSITIVE_XML_ELEMENT_NAME}\\b[^>]*\\/\\s*>`,
  "gi"
);
const UNTERMINATED_SENSITIVE_XML_ELEMENT = new RegExp(
  `<${SENSITIVE_XML_ELEMENT_NAME}\\b[^>]*>[^<]*`,
  "gi"
);

export type ResponseBodyDiagnostic = {
  responseBodyLength: number;
  responseBodyPreview: string;
};

export type SafeErrorDiagnostic = {
  errorName?: string;
  errorCode?: string;
  statusCode?: number;
  contentType?: string;
  responseBodyLength?: number;
  responseBodyPreview?: string;
  faultCode?: string;
};

/** Redacts credential-bearing XML elements and applies the global preview bound. */
export function redactDiagnosticPreview(
  value: string,
  requestedMaxLength = MAX_DIAGNOSTIC_PREVIEW_LENGTH
): string {
  const maxLength = normalizePreviewLength(requestedMaxLength);

  return value
    .replace(
      PAIRED_SENSITIVE_XML_ELEMENT,
      (_match, tagName: string) => `<${tagName}>[REDACTED]</${tagName}>`
    )
    .replace(
      SELF_CLOSING_SENSITIVE_XML_ELEMENT,
      (_match, tagName: string) => `<${tagName}>[REDACTED]</${tagName}>`
    )
    .replace(
      UNTERMINATED_SENSITIVE_XML_ELEMENT,
      (_match, tagName: string) => `<${tagName}>[REDACTED]`
    )
    .slice(0, maxLength);
}

/** Produces the only response-body shape allowed in errors and logs. */
export function createResponseBodyDiagnostic(
  responseBody: string,
  requestedMaxLength = MAX_DIAGNOSTIC_PREVIEW_LENGTH
): ResponseBodyDiagnostic {
  return {
    responseBodyLength: responseBody.length,
    responseBodyPreview: redactDiagnosticPreview(
      responseBody,
      requestedMaxLength
    ),
  };
}

/** Extracts a scalar allowlist from an error without exposing the error or cause. */
export function createSafeErrorDiagnostic(error: unknown): SafeErrorDiagnostic {
  if (!(error && typeof error === "object")) {
    return {};
  }

  const candidate = error as Record<string, unknown>;
  const diagnostic: SafeErrorDiagnostic = {};

  assignSafeString(diagnostic, "errorName", candidate.name);
  assignSafeString(diagnostic, "errorCode", candidate.code);
  assignSafeNumber(diagnostic, "statusCode", candidate.statusCode);
  assignSafeString(diagnostic, "contentType", candidate.contentType);
  assignSafeNumber(
    diagnostic,
    "responseBodyLength",
    candidate.responseBodyLength
  );
  if (typeof candidate.responseBodyPreview === "string") {
    diagnostic.responseBodyPreview = redactDiagnosticPreview(
      candidate.responseBodyPreview
    );
  }
  assignSafeString(diagnostic, "faultCode", candidate.faultCode);

  return diagnostic;
}

function normalizePreviewLength(requestedMaxLength: number): number {
  if (!Number.isFinite(requestedMaxLength)) {
    return MAX_DIAGNOSTIC_PREVIEW_LENGTH;
  }

  return Math.max(
    0,
    Math.min(Math.trunc(requestedMaxLength), MAX_DIAGNOSTIC_PREVIEW_LENGTH)
  );
}

function assignSafeString<
  TKey extends "errorName" | "errorCode" | "contentType" | "faultCode",
>(target: SafeErrorDiagnostic, key: TKey, value: unknown): void {
  if (typeof value === "string") {
    target[key] = redactDiagnosticPreview(value, MAX_DIAGNOSTIC_SCALAR_LENGTH);
  }
}

function assignSafeNumber<TKey extends "statusCode" | "responseBodyLength">(
  target: SafeErrorDiagnostic,
  key: TKey,
  value: unknown
): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    target[key] = value;
  }
}
