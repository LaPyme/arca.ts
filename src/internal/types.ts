/** Target environment for ARCA services. */
export type ArcaEnvironment = "production" | "test";

/** All ARCA service identifiers, including WSAA. */
export type ArcaServiceName =
  | "wsaa"
  | "wsfe"
  | "wsmtxca"
  | "padron-a5"
  | "padron-a13";

/** ARCA service identifiers excluding the WSAA authentication service. */
export type ArcaServiceTarget = Exclude<ArcaServiceName, "wsaa">;

/** Padron-specific service identifiers. */
export type ArcaPadronServiceName = Extract<
  ArcaServiceTarget,
  "padron-a5" | "padron-a13"
>;

/** WSAA service identifiers used for authentication scoping. */
export type ArcaWsaaServiceId =
  | "wsfe"
  | "wsmtxca"
  | "ws_sr_constancia_inscripcion"
  | "ws_sr_padron_a13";

export type ArcaSoapVersion = "1.1" | "1.2";

/** Configuration required to create an ARCA client. */
export type ArcaClientConfig = {
  taxId: string;
  certificatePem: string;
  privateKeyPem: string;
  environment: ArcaEnvironment;
};

/** Credentials returned by a WSAA login. */
export type ArcaAuthCredentials = {
  token: string;
  sign: string;
  expiresAt: string;
};

export type ArcaRepresentedTaxId = number | string | undefined;

export type ArcaSoapRequest<TBody> = {
  service: ArcaServiceName;
  operation: string;
  body: TBody;
};

export type ArcaSoapResponse<TResult> = {
  service: ArcaServiceName;
  operation: string;
  raw: string;
  result: TResult;
};

export type ArcaAuthOptions = {
  forceRefresh?: boolean;
  representedTaxId?: ArcaRepresentedTaxId;
};

export type ArcaSoapExecutionOptions<TBody> = {
  service: ArcaServiceName;
  operation: string;
  bodyElementName?: string;
  bodyElementNamespaceMode?: "default" | "prefix";
  body: TBody;
};
