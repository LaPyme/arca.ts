/** Base error class for all ARCA-related errors. */
export class ArcaError extends Error {
  readonly code: string;
  override readonly name: string = "ArcaError";

  constructor(message: string, code = "ARCA_ERROR", options?: ErrorOptions) {
    super(message, options);
    this.code = code;
  }
}

/** Thrown when the ARCA client configuration is missing or invalid. */
export class ArcaConfigurationError extends ArcaError {
  override readonly name: string = "ArcaConfigurationError";

  constructor(message: string, options?: ErrorOptions) {
    super(message, "ARCA_CONFIGURATION_ERROR", options);
  }
}

class ArcaNotImplementedError extends ArcaError {
  override readonly name: string = "ArcaNotImplementedError";

  constructor(message: string, options?: ErrorOptions) {
    super(message, "ARCA_NOT_IMPLEMENTED", options);
  }
}

/** Thrown when an HTTP request to an ARCA endpoint fails at the transport level. */
export class ArcaTransportError extends ArcaError {
  override readonly name: string = "ArcaTransportError";
  readonly statusCode?: number;
  readonly responseBody?: string;

  constructor(
    message: string,
    options?: ErrorOptions & {
      statusCode?: number;
      responseBody?: string;
    }
  ) {
    super(message, "ARCA_TRANSPORT_ERROR", options);
    this.statusCode = options?.statusCode;
    this.responseBody = options?.responseBody;
  }
}

/** Thrown when the SOAP response contains a Fault element. */
export class ArcaSoapFaultError extends ArcaError {
  override readonly name: string = "ArcaSoapFaultError";
  readonly faultCode?: string;
  readonly detail?: unknown;

  constructor(
    message: string,
    options?: ErrorOptions & {
      faultCode?: string;
      detail?: unknown;
    }
  ) {
    super(message, "ARCA_SOAP_FAULT", options);
    this.faultCode = options?.faultCode;
    this.detail = options?.detail;
  }
}

/** Thrown when an ARCA service (WSFE, WSMTXCA, Padron) returns a domain-level error. */
export class ArcaServiceError extends ArcaError {
  override readonly name: string = "ArcaServiceError";
  readonly serviceCode?: string | number;
  readonly detail?: unknown;

  constructor(
    message: string,
    options?: ErrorOptions & {
      serviceCode?: string | number;
      detail?: unknown;
    }
  ) {
    super(message, "ARCA_SERVICE_ERROR", options);
    this.serviceCode = options?.serviceCode;
    this.detail = options?.detail;
  }
}
