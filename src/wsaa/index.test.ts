import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import forge from "node-forge";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockPostXml = vi.hoisted(() => vi.fn());
const temporaryDirectories: string[] = [];

vi.mock("../internal/http", () => ({
  postXml: mockPostXml,
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

async function createDiskCachedWsaaConfig() {
  const directory = await mkdtemp(path.join(tmpdir(), "arcats-wsaa-cache-"));
  temporaryDirectories.push(directory);

  return {
    ...createWsaaConfig(),
    wsaa: {
      cache: {
        mode: "disk" as const,
        directory,
      },
    },
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

async function loadWsaaModule() {
  const module = await import("./index");
  return module;
}

afterEach(async () => {
  mockPostXml.mockReset();
  vi.resetModules();

  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("createWsaaAuthModule", () => {
  it("requests and parses WSAA credentials", async () => {
    mockPostXml.mockResolvedValueOnce(
      createWsaaSoapResponse(createLoginTicketResponseXml())
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
    let resolveResponse: ((value: string) => void) | undefined;
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

    resolveResponse?.(createWsaaSoapResponse(createLoginTicketResponseXml()));

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
        createWsaaSoapResponse(createLoginTicketResponseXml({ token: "first" }))
      )
      .mockResolvedValueOnce(
        createWsaaSoapResponse(
          createLoginTicketResponseXml({ token: "second" })
        )
      )
      .mockResolvedValueOnce(
        createWsaaSoapResponse(createLoginTicketResponseXml({ token: "third" }))
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

  it("persists WSAA credentials only when disk cache mode is configured", async () => {
    const config = await createDiskCachedWsaaConfig();
    mockPostXml
      .mockResolvedValueOnce(
        createWsaaSoapResponse(createLoginTicketResponseXml({ token: "first" }))
      )
      .mockResolvedValueOnce(
        createWsaaSoapResponse(
          createLoginTicketResponseXml({ token: "second" })
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
      token: "second",
    });
    expect(mockPostXml).not.toHaveBeenCalled();
  });

  it("rejects missing or invalid WSAA login ticket payloads", async () => {
    const config = createWsaaConfig();
    const { createWsaaAuthModule } = await loadWsaaModule();

    mockPostXml.mockResolvedValueOnce(createWsaaSoapResponse());
    await expect(
      createWsaaAuthModule({ config }).login("wsfe")
    ).rejects.toMatchObject({
      name: "ArcaTransportError",
      message: "WSAA response did not include loginCmsReturn XML",
    });

    mockPostXml.mockResolvedValueOnce(
      createWsaaSoapResponse(
        '<?xml version="1.0" encoding="UTF-8"?><loginTicketResponse><header /></loginTicketResponse>'
      )
    );
    await expect(
      createWsaaAuthModule({ config }).login("wsfe")
    ).rejects.toMatchObject({
      name: "ArcaTransportError",
      message: "Invalid WSAA login ticket response structure",
    });
  });
});
