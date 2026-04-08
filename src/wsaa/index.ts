import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import forge from "node-forge";
import { ARCA_WSAA_CONFIG } from "../config";
import { ArcaSoapFaultError, ArcaTransportError } from "../errors";
import { postXml } from "../internal/http";
import {
  buildSoapEnvelope,
  getSingleBodyEntry,
  parseSoapBody,
  parseXmlDocument,
} from "../internal/xml";
import type {
  ArcaAuthCredentials,
  ArcaAuthOptions,
  ArcaClientConfig,
  ArcaWsaaCacheConfig,
  ArcaWsaaServiceId,
} from "../internal/types";

export type WsaaAuthModule = {
  login(
    service: ArcaWsaaServiceId,
    options?: ArcaAuthOptions
  ): Promise<ArcaAuthCredentials>;
};

export type CreateWsaaAuthModuleOptions = {
  config: ArcaClientConfig;
};

type ForgeSignerOptions = Parameters<
  forge.pkcs7.PkcsSignedData["addSigner"]
>[0];
type ForgeAuthenticatedAttribute = NonNullable<
  ForgeSignerOptions["authenticatedAttributes"]
>[number];
type WsaaAuthenticatedAttribute = Omit<ForgeAuthenticatedAttribute, "value"> & {
  value?: string | Date;
};

export function createWsaaAuthModule(
  options: CreateWsaaAuthModuleOptions
): WsaaAuthModule {
  const cache = new Map<string, ArcaAuthCredentials>();
  const inFlight = new Map<string, Promise<ArcaAuthCredentials>>();
  const persistedCache = createPersistedCredentialStore(options.config.wsaa?.cache);

  return {
    async login(service, authOptions = {}) {
      const cacheKey = buildWsaaCacheKey(options.config, service);
      const running = inFlight.get(cacheKey);
      if (running) {
        return running;
      }

      const loginPromise = (async () => {
        if (!authOptions.forceRefresh) {
          const cached = await getCachedCredentials(
            cache,
            cacheKey,
            persistedCache
          );
          if (cached) {
            return cached;
          }
        }

        const credentials = await requestCredentials(options.config, service);
        cache.set(cacheKey, credentials);
        await persistedCache.write(cacheKey, credentials);
        return credentials;
      })();

      inFlight.set(cacheKey, loginPromise);

      try {
        return await loginPromise;
      } catch (error) {
        if (
          !authOptions.forceRefresh &&
          error instanceof ArcaSoapFaultError &&
          error.faultCode === "ns1:coe.alreadyAuthenticated"
        ) {
          const cached = await getCachedCredentials(
            cache,
            cacheKey,
            persistedCache
          );
          if (cached) {
            return cached;
          }
        }

        throw error;
      } finally {
        inFlight.delete(cacheKey);
      }
    },
  };
}

async function requestCredentials(
  config: ArcaClientConfig,
  service: ArcaWsaaServiceId
): Promise<ArcaAuthCredentials> {
  const loginTicketRequestXml = buildLoginTicketRequest(service);
  const signedCms = signLoginTicketRequest(loginTicketRequestXml, {
    certificatePem: config.certificatePem,
    privateKeyPem: config.privateKeyPem,
  });

  const requestXml = buildSoapEnvelope(
    ARCA_WSAA_CONFIG.soapVersion,
    "loginCms",
    ARCA_WSAA_CONFIG.namespace,
    { in0: signedCms }
  );

  const responseXml = await postXml({
    url: ARCA_WSAA_CONFIG.endpoint[config.environment],
    body: requestXml,
    contentType: 'text/xml; charset="utf-8"',
    soapAction: ARCA_WSAA_CONFIG.soapActionBase,
  });

  const soapBody = parseSoapBody(responseXml);
  const [, response] = getSingleBodyEntry<Record<string, unknown>>(soapBody);
  const loginCmsReturn = response.loginCmsReturn;

  if (typeof loginCmsReturn !== "string" || loginCmsReturn.trim().length < 1) {
    throw new ArcaTransportError(
      "WSAA response did not include loginCmsReturn XML"
    );
  }

  return parseLoginTicketResponse(loginCmsReturn);
}

function buildWsaaCacheKey(
  config: ArcaClientConfig,
  service: ArcaWsaaServiceId
): string {
  return [config.environment, service, getCertificateFingerprint(config)].join(
    ":"
  );
}

function getCertificateFingerprint(config: ArcaClientConfig): string {
  return createHash("sha256").update(config.certificatePem).digest("hex");
}

function isCredentialValid(credentials: ArcaAuthCredentials): boolean {
  return new Date(credentials.expiresAt).getTime() - Date.now() > 60_000;
}

async function getCachedCredentials(
  cache: Map<string, ArcaAuthCredentials>,
  cacheKey: string,
  persistedCache: PersistedCredentialStore
): Promise<ArcaAuthCredentials | null> {
  const localCached = cache.get(cacheKey);
  if (localCached && isCredentialValid(localCached)) {
    return localCached;
  }

  const persisted = await persistedCache.read(cacheKey);
  if (persisted) {
    cache.set(cacheKey, persisted);
    return persisted;
  }

  return null;
}

type PersistedCredentialStore = {
  read(cacheKey: string): Promise<ArcaAuthCredentials | null>;
  write(cacheKey: string, credentials: ArcaAuthCredentials): Promise<void>;
};

function createPersistedCredentialStore(
  cacheConfig: ArcaWsaaCacheConfig | undefined
): PersistedCredentialStore {
  if (!cacheConfig || cacheConfig.mode !== "disk") {
    return {
      async read() {
        return null;
      },
      async write() {},
    };
  }

  const cacheDir = path.resolve(cacheConfig.directory);

  return {
    async read(cacheKey) {
      try {
        const serialized = await readFile(
          getSharedCacheFilePath(cacheDir, cacheKey),
          "utf8"
        );
        const parsed = JSON.parse(serialized) as Partial<ArcaAuthCredentials>;

        if (
          typeof parsed.token !== "string" ||
          typeof parsed.sign !== "string" ||
          typeof parsed.expiresAt !== "string"
        ) {
          return null;
        }

        const credentials = {
          token: parsed.token,
          sign: parsed.sign,
          expiresAt: parsed.expiresAt,
        } satisfies ArcaAuthCredentials;

        return isCredentialValid(credentials) ? credentials : null;
      } catch {
        return null;
      }
    },
    async write(cacheKey, credentials) {
      await mkdir(cacheDir, { recursive: true });
      await writeFile(
        getSharedCacheFilePath(cacheDir, cacheKey),
        JSON.stringify(credentials),
        "utf8"
      );
    },
  };
}

function getSharedCacheFilePath(cacheDir: string, cacheKey: string): string {
  const fileName = `${createHash("sha256").update(cacheKey).digest("hex")}.json`;
  return path.join(cacheDir, fileName);
}

function buildLoginTicketRequest(service: ArcaWsaaServiceId): string {
  const uniqueId = Math.floor(Date.now() / 1000);
  const generationTime = new Date(Date.now() - 5 * 60_000)
    .toISOString()
    .replace(".000Z", "Z");
  const expirationTime = new Date(Date.now() + 5 * 60_000)
    .toISOString()
    .replace(".000Z", "Z");

  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${uniqueId}</uniqueId>
    <generationTime>${generationTime}</generationTime>
    <expirationTime>${expirationTime}</expirationTime>
  </header>
  <service>${service}</service>
</loginTicketRequest>`;
}

function signLoginTicketRequest(
  loginTicketRequestXml: string,
  options: Pick<ArcaClientConfig, "certificatePem" | "privateKeyPem">
): string {
  const certificate = forge.pki.certificateFromPem(options.certificatePem);
  const privateKey = forge.pki.privateKeyFromPem(options.privateKeyPem);
  const signedData = forge.pkcs7.createSignedData();

  signedData.content = forge.util.createBuffer(loginTicketRequestXml, "utf8");
  signedData.addCertificate(certificate);
  const authenticatedAttributes: WsaaAuthenticatedAttribute[] = [
    {
      type: String(forge.pki.oids.contentType),
      value: String(forge.pki.oids.data),
    },
    {
      type: String(forge.pki.oids.messageDigest),
    },
    {
      type: String(forge.pki.oids.signingTime),
      value: new Date(),
    },
  ];

  const signerOptions: ForgeSignerOptions = {
    key: privateKey,
    certificate,
    digestAlgorithm: String(forge.pki.oids.sha1),
    authenticatedAttributes:
      authenticatedAttributes as unknown as ForgeSignerOptions["authenticatedAttributes"],
  };

  signedData.addSigner(signerOptions);
  signedData.sign();

  const der = forge.asn1.toDer(signedData.toAsn1()).getBytes();
  return Buffer.from(der, "binary").toString("base64");
}

function parseLoginTicketResponse(xml: string): ArcaAuthCredentials {
  const parsed = parseXmlDocument<Record<string, unknown>>(xml);
  const response =
    (parsed.loginTicketResponse as Record<string, unknown> | undefined) ??
    parsed;
  const header = response.header as Record<string, unknown> | undefined;
  const credentials = response.credentials as
    | Record<string, unknown>
    | undefined;
  const token = credentials?.token;
  const sign = credentials?.sign;
  const expiresAt = header?.expirationTime;

  if (
    typeof token !== "string" ||
    typeof sign !== "string" ||
    typeof expiresAt !== "string"
  ) {
    throw new ArcaTransportError(
      "Invalid WSAA login ticket response structure"
    );
  }

  return {
    token,
    sign,
    expiresAt,
  };
}
