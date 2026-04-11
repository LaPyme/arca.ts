import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { ArcaSoapFaultError } from "../errors";
import type { ArcaSoapVersion } from "../internal/types";

const xmlBuilder = new XMLBuilder({
  attributeNamePrefix: "@_",
  format: false,
  ignoreAttributes: false,
  suppressBooleanAttributes: false,
  suppressEmptyNode: true,
});

const xmlParser = new XMLParser({
  attributeNamePrefix: "@_",
  ignoreAttributes: false,
  parseAttributeValue: false,
  parseTagValue: false,
  removeNSPrefix: true,
  trimValues: true,
});

export function buildSoapEnvelope(
  soapVersion: ArcaSoapVersion,
  operation: string,
  namespace: string,
  body: Record<string, unknown>,
  options?: {
    namespaceMode?: "default" | "prefix";
  }
): string {
  const prefix = soapVersion === "1.2" ? "soap12" : "soap";
  const envelopeNamespace =
    soapVersion === "1.2"
      ? "http://www.w3.org/2003/05/soap-envelope"
      : "http://schemas.xmlsoap.org/soap/envelope/";
  const namespaceMode = options?.namespaceMode ?? "default";
  const operationElementName =
    namespaceMode === "prefix" ? `tns:${operation}` : operation;
  const operationNamespaceAttributes =
    namespaceMode === "prefix"
      ? { "@_xmlns:tns": namespace }
      : { "@_xmlns": namespace };

  const payload = {
    [`${prefix}:Envelope`]: {
      "@_xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
      "@_xmlns:xsd": "http://www.w3.org/2001/XMLSchema",
      [`@_xmlns:${prefix}`]: envelopeNamespace,
      [`${prefix}:Body`]: {
        [operationElementName]: {
          ...operationNamespaceAttributes,
          ...pruneUndefinedDeep(body),
        },
      },
    },
  };

  return `<?xml version="1.0" encoding="utf-8"?>${xmlBuilder.build(payload)}`;
}

export function parseSoapBody(xml: string): Record<string, unknown> {
  const parsed = xmlParser.parse(xml) as Record<string, unknown>;
  const envelope = parsed.Envelope as Record<string, unknown> | undefined;
  const body = envelope?.Body as Record<string, unknown> | undefined;

  if (!body) {
    throw new ArcaSoapFaultError("Invalid SOAP response: missing body", {
      detail: parsed,
    });
  }

  const fault = body.Fault as Record<string, unknown> | undefined;
  if (fault) {
    throw createSoapFaultError(fault);
  }

  return body;
}

export function getSingleBodyEntry<T = unknown>(
  body: Record<string, unknown>
): [string, T] {
  const entries = Object.entries(body).filter(([key]) => key !== "@_xmlns");
  if (entries.length !== 1) {
    throw new ArcaSoapFaultError(
      `Invalid SOAP response: expected a single body entry, got ${entries.length}`,
      {
        detail: body,
      }
    );
  }

  return entries[0] as [string, T];
}

export function parseXmlDocument<T = unknown>(xml: string): T {
  return xmlParser.parse(xml) as T;
}

export function pruneUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((item) => pruneUndefinedDeep(item))
      .filter((item) => item !== undefined) as T;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, nestedValue]) => nestedValue !== undefined)
      .map(([key, nestedValue]) => [key, pruneUndefinedDeep(nestedValue)]);
    return Object.fromEntries(entries) as T;
  }

  return value;
}

function createSoapFaultError(
  fault: Record<string, unknown>
): ArcaSoapFaultError {
  const faultCode =
    typeof fault.faultcode === "string"
      ? fault.faultcode
      : getNestedString(fault, ["Code", "Value"]);
  const message =
    typeof fault.faultstring === "string"
      ? fault.faultstring
      : (getNestedString(fault, ["Reason", "Text"]) ??
        "ARCA SOAP fault response");

  return new ArcaSoapFaultError(message, {
    faultCode: faultCode ?? undefined,
    detail: fault,
  });
}

function getNestedString(
  value: Record<string, unknown>,
  path: string[]
): string | null {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object") {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : null;
}
