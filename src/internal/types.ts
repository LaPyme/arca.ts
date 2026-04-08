export type ArcaEnvironment = "production" | "test";

export type ArcaServiceName =
  | "wsaa"
  | "wsfe"
  | "wsmtxca"
  | "padron-a5"
  | "padron-a13";

export type ArcaServiceTarget = Exclude<ArcaServiceName, "wsaa">;

export type ArcaPadronServiceName = Extract<
  ArcaServiceTarget,
  "padron-a5" | "padron-a13"
>;

export type ArcaWsaaServiceId =
  | "wsfe"
  | "wsmtxca"
  | "ws_sr_constancia_inscripcion"
  | "ws_sr_padron_a13";

export type ArcaSoapVersion = "1.1" | "1.2";

export type ArcaWsaaCacheConfig =
  | {
      mode?: "memory";
    }
  | {
      mode: "disk";
      directory: string;
    };

export type ArcaClientConfig = {
  taxId: string;
  certificatePem: string;
  privateKeyPem: string;
  environment: ArcaEnvironment;
  wsaa?: {
    cache?: ArcaWsaaCacheConfig;
  };
};

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
