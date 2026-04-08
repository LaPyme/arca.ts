export class ArcaError extends Error {
  readonly code: string;
  override readonly name: string = "ArcaError";

  constructor(message: string, code = "ARCA_ERROR", options?: ErrorOptions) {
    super(message, options);
    this.code = code;
  }
}

export class ArcaConfigurationError extends ArcaError {
  override readonly name: string = "ArcaConfigurationError";

  constructor(message: string, options?: ErrorOptions) {
    super(message, "ARCA_CONFIGURATION_ERROR", options);
  }
}

export class ArcaNotImplementedError extends ArcaError {
  override readonly name: string = "ArcaNotImplementedError";

  constructor(message: string, options?: ErrorOptions) {
    super(message, "ARCA_NOT_IMPLEMENTED", options);
  }
}

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
