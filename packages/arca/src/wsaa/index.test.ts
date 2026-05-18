import forge from "node-forge";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ArcaWsaaSessionKey,
  ArcaWsaaSessionStore,
} from "../internal/types";

const mockPostXml = vi.hoisted(() => vi.fn());

vi.mock("../internal/http", () => ({
  postXmlWithMetadata: mockPostXml,
}));

function createWsaaConfig() {
  const keys = forge.pki.rsa.generateKeyPair(512);
  const certificate = forge.pki.createCertificate();
  certificate.serialNumber = String(Date.now());
  certificate.publicKey = keys.publicKey;
  certificate.validity.notBefore = new Date();
  certificate.validity.notAfter = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const attrs = [
    {
      name: "commonName",
      value: `arca-test-${Math.random().toString(16).slice(2)}`,
    },
  ];
  certificate.setSubject(attrs);
  certificate.setIssuer(attrs);
  certificate.sign(keys.privateKey);

  return {
    taxId: "20123456789",
    certificatePem: forge.pki.certificateToPem(certificate),
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
    environment: "test" as const,
  };
}

function createLoginTicketResponseXml(overrides?: {
  token?: string;
  sign?: string;
  expiresAt?: string;
}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketResponse>
  <header>
    <expirationTime>${overrides?.expiresAt ?? "2099-01-01T00:00:00Z"}</expirationTime>
  </header>
  <credentials>
    <token>${overrides?.token ?? "token"}</token>
    <sign>${overrides?.sign ?? "sign"}</sign>
  </credentials>
</loginTicketResponse>`;
}

function createWsaaSoapResponse(loginCmsReturnXml?: string) {
  const loginCmsReturn = loginCmsReturnXml
    ? `<loginCmsReturn><![CDATA[${loginCmsReturnXml}]]></loginCmsReturn>`
    : "";

  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <loginCmsResponse xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov">
      ${loginCmsReturn}
    </loginCmsResponse>
  </soap:Body>
</soap:Envelope>`;
}

function createSoapFaultResponse(faultCode: string, faultMessage: string) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode>${faultCode}</faultcode>
      <faultstring>${faultMessage}</faultstring>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`;
}

function createHttpResponse(body: string) {
  return {
    body,
    statusCode: 200,
    contentType: "text/xml; charset=utf-8",
  };
}

async function loadWsaaModule() {
  const module = await import("./index");
  return module;
}

afterEach(() => {
  mockPostXml.mockReset();
  vi.resetModules();
});

describe("createWsaaAuthModule", () => {
  it("requests and parses WSAA credentials", async () => {
    mockPostXml.mockResolvedValueOnce(
      createHttpResponse(createWsaaSoapResponse(createLoginTicketResponseXml()))
    );

    const { createWsaaAuthModule } = await loadWsaaModule();
    const auth = createWsaaAuthModule({ config: createWsaaConfig() });

    await expect(auth.login("wsfe")).resolves.toEqual({
      token: "token",
      sign: "sign",
      expiresAt: "2099-01-01T00:00:00Z",
    });

    expect(mockPostXml).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
        contentType: 'text/xml; charset="utf-8"',
        soapAction: "",
      })
    );
    expect(mockPostXml.mock.calls[0]?.[0]?.body).toContain("<loginCms ");
    expect(mockPostXml.mock.calls[0]?.[0]?.body).toContain("<in0>");
  });

  it("deduplicates in-flight requests and reuses cached credentials", async () => {
    let resolveResponse:
      | ((value: ReturnType<typeof createHttpResponse>) => void)
      | undefined;
    mockPostXml.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveResponse = resolve;
        })
    );

    const { createWsaaAuthModule } = await loadWsaaModule();
    const auth = createWsaaAuthModule({ config: createWsaaConfig() });

    const firstLogin = auth.login("wsfe");
    const secondLogin = auth.login("wsfe");

    await vi.waitFor(() => {
      expect(mockPostXml).toHaveBeenCalledTimes(1);
    });

    resolveResponse?.(
      createHttpResponse(createWsaaSoapResponse(createLoginTicketResponseXml()))
    );

    const [firstCredentials, secondCredentials] = await Promise.all([
      firstLogin,
      secondLogin,
    ]);

    expect(firstCredentials).toEqual(secondCredentials);
    await expect(auth.login("wsfe")).resolves.toEqual(firstCredentials);
    expect(mockPostXml).toHaveBeenCalledTimes(1);
  });

  it("forces a refresh when requested and keeps the default cache in memory only", async () => {
    const config = createWsaaConfig();
    mockPostXml
      .mockResolvedValueOnce(
        createHttpResponse(
          createWsaaSoapResponse(
            createLoginTicketResponseXml({ token: "first" })
          )
        )
      )
      .mockResolvedValueOnce(
        createHttpResponse(
          createWsaaSoapResponse(
            createLoginTicketResponseXml({ token: "second" })
          )
        )
      )
      .mockResolvedValueOnce(
        createHttpResponse(
          createWsaaSoapResponse(
            createLoginTicketResponseXml({ token: "third" })
          )
        )
      );

    const { createWsaaAuthModule } = await loadWsaaModule();
    const auth = createWsaaAuthModule({ config });

    await expect(auth.login("wsmtxca")).resolves.toMatchObject({
      token: "first",
    });
    await expect(
      auth.login("wsmtxca", { forceRefresh: true })
    ).resolves.toMatchObject({
      token: "second",
    });
    expect(mockPostXml).toHaveBeenCalledTimes(2);

    vi.clearAllMocks();
    vi.resetModules();

    const reloaded = await loadWsaaModule();
    const reloadedAuth = reloaded.createWsaaAuthModule({ config });
    await expect(reloadedAuth.login("wsmtxca")).resolves.toMatchObject({
      token: "third",
    });
    expect(mockPostXml).toHaveBeenCalledTimes(1);
  });

  it("rejects missing or invalid WSAA login ticket payloads", async () => {
    const config = createWsaaConfig();
    const { createWsaaAuthModule } = await loadWsaaModule();

    mockPostXml.mockResolvedValueOnce(
      createHttpResponse(createWsaaSoapResponse())
    );
    await expect(
      createWsaaAuthModule({ config }).login("wsfe")
    ).rejects.toMatchObject({
      name: "ArcaTransportError",
      message: "WSAA response did not include loginCmsReturn XML",
    });

    mockPostXml.mockResolvedValueOnce(
      createHttpResponse(
        createWsaaSoapResponse(
          '<?xml version="1.0" encoding="UTF-8"?><loginTicketResponse><header /></loginTicketResponse>'
        )
      )
    );
    await expect(
      createWsaaAuthModule({ config }).login("wsfe")
    ).rejects.toMatchObject({
      name: "ArcaTransportError",
      message: "Invalid WSAA login ticket response structure",
    });
  });

  it("hydrates process memory from a durable store hit and avoids WSAA", async () => {
    const credentials = {
      token: "stored-token",
      sign: "stored-sign",
      expiresAt: "2099-01-01T00:00:00Z",
    };
    const store = {
      get: vi.fn().mockResolvedValue(credentials),
      set: vi.fn(),
    };

    const { createWsaaAuthModule } = await loadWsaaModule();
    const auth = createWsaaAuthModule({
      config: { ...createWsaaConfig(), wsaaSessionStore: store },
    });

    await expect(auth.login("wsfe")).resolves.toEqual(credentials);
    await expect(auth.login("wsfe")).resolves.toEqual(credentials);
    expect(mockPostXml).not.toHaveBeenCalled();
    expect(store.get).toHaveBeenCalledTimes(1);
  });

  it("re-checks the durable store inside the lock before calling WSAA", async () => {
    const credentials = {
      token: "locked-token",
      sign: "locked-sign",
      expiresAt: "2099-01-01T00:00:00Z",
    };
    const withLock = vi.fn(
      async <T>(_key: ArcaWsaaSessionKey, fn: () => Promise<T>) => await fn()
    );
    const store = {
      get: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(credentials),
      set: vi.fn(),
      withLock: withLock as ArcaWsaaSessionStore["withLock"],
    };

    const { createWsaaAuthModule } = await loadWsaaModule();
    const auth = createWsaaAuthModule({
      config: { ...createWsaaConfig(), wsaaSessionStore: store },
    });

    await expect(auth.login("wsfe")).resolves.toEqual(credentials);
    expect(mockPostXml).not.toHaveBeenCalled();
    expect(store.withLock).toHaveBeenCalledTimes(1);
    expect(store.get).toHaveBeenCalledTimes(2);
  });

  it("recovers coe.alreadyAuthenticated from a durable store hit", async () => {
    const credentials = {
      token: "recovered-token",
      sign: "recovered-sign",
      expiresAt: "2099-01-01T00:00:00Z",
    };
    const store = {
      get: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(credentials),
      set: vi.fn(),
    };
    mockPostXml.mockResolvedValueOnce(
      createHttpResponse(
        createSoapFaultResponse(
          "ns1:coe.alreadyAuthenticated",
          "El CEE ya posee un TA valido"
        )
      )
    );

    const { createWsaaAuthModule } = await loadWsaaModule();
    const auth = createWsaaAuthModule({
      config: { ...createWsaaConfig(), wsaaSessionStore: store },
    });

    await expect(auth.login("wsfe")).resolves.toEqual(credentials);
    expect(mockPostXml).toHaveBeenCalledTimes(1);
  });

  it("throws an actionable error for coe.alreadyAuthenticated without a durable store", async () => {
    mockPostXml.mockResolvedValueOnce(
      createHttpResponse(
        createSoapFaultResponse(
          "ns1:coe.alreadyAuthenticated",
          "El CEE ya posee un TA valido"
        )
      )
    );

    const { createWsaaAuthModule } = await loadWsaaModule();
    const auth = createWsaaAuthModule({ config: createWsaaConfig() });

    await expect(auth.login("wsfe")).rejects.toMatchObject({
      name: "ArcaConfigurationError",
      message: expect.stringContaining("durable wsaaSessionStore"),
    });
  });

  it("ignores expired durable credentials and replaces them after WSAA succeeds", async () => {
    const store = {
      get: vi.fn().mockResolvedValue({
        token: "expired",
        sign: "expired",
        expiresAt: "2000-01-01T00:00:00Z",
      }),
      set: vi.fn(),
    };
    mockPostXml.mockResolvedValueOnce(
      createHttpResponse(
        createWsaaSoapResponse(
          createLoginTicketResponseXml({ token: "fresh-token" })
        )
      )
    );

    const { createWsaaAuthModule } = await loadWsaaModule();
    const auth = createWsaaAuthModule({
      config: { ...createWsaaConfig(), wsaaSessionStore: store },
    });

    await expect(auth.login("wsfe")).resolves.toMatchObject({
      token: "fresh-token",
    });
    expect(store.set).toHaveBeenCalledWith(
      expect.objectContaining({ service: "wsfe", environment: "test" }),
      expect.objectContaining({ token: "fresh-token" })
    );
  });

  it("surfaces store failures with useful context", async () => {
    const store = {
      get: vi.fn().mockRejectedValue(new Error("redis unavailable")),
      set: vi.fn(),
    };

    const { createWsaaAuthModule } = await loadWsaaModule();
    const auth = createWsaaAuthModule({
      config: { ...createWsaaConfig(), wsaaSessionStore: store },
    });

    await expect(auth.login("wsfe")).rejects.toMatchObject({
      name: "ArcaConfigurationError",
      message: "WSAA session store get failed for service wsfe",
    });
  });

  it("lets independently created clients share durable credentials", async () => {
    mockPostXml.mockResolvedValueOnce(
      createHttpResponse(
        createWsaaSoapResponse(
          createLoginTicketResponseXml({ token: "shared-token" })
        )
      )
    );

    const { createWsaaAuthModule } = await loadWsaaModule();
    const { createMemoryWsaaSessionStore } = await import("./session-store");
    const store = createMemoryWsaaSessionStore();
    const config = { ...createWsaaConfig(), wsaaSessionStore: store };
    const firstAuth = createWsaaAuthModule({ config });
    const secondAuth = createWsaaAuthModule({ config });

    await expect(firstAuth.login("wsfe")).resolves.toMatchObject({
      token: "shared-token",
    });
    await expect(secondAuth.login("wsfe")).resolves.toMatchObject({
      token: "shared-token",
    });
    expect(mockPostXml).toHaveBeenCalledTimes(1);
  });

  it("serializes cold starts through a shared store lock", async () => {
    let resolveResponse:
      | ((value: ReturnType<typeof createHttpResponse>) => void)
      | undefined;
    mockPostXml.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveResponse = resolve;
        })
    );

    const { createWsaaAuthModule } = await loadWsaaModule();
    const { createMemoryWsaaSessionStore } = await import("./session-store");
    const store = createMemoryWsaaSessionStore();
    const config = { ...createWsaaConfig(), wsaaSessionStore: store };
    const firstAuth = createWsaaAuthModule({ config });
    const secondAuth = createWsaaAuthModule({ config });

    const firstLogin = firstAuth.login("wsfe");
    const secondLogin = secondAuth.login("wsfe");

    await vi.waitFor(() => {
      expect(mockPostXml).toHaveBeenCalledTimes(1);
    });

    resolveResponse?.(
      createHttpResponse(
        createWsaaSoapResponse(
          createLoginTicketResponseXml({ token: "locked-shared-token" })
        )
      )
    );

    await expect(Promise.all([firstLogin, secondLogin])).resolves.toEqual([
      expect.objectContaining({ token: "locked-shared-token" }),
      expect.objectContaining({ token: "locked-shared-token" }),
    ]);
    expect(mockPostXml).toHaveBeenCalledTimes(1);
  });
});
