import { describe, expect, it, vi } from "vitest";

const mockAssertArcaClientConfig = vi.hoisted(() => vi.fn());
const mockNormalizeArcaClientConfig = vi.hoisted(() => vi.fn());
const mockCreateWsaaAuthModule = vi.hoisted(() => vi.fn());
const mockCreateSoapTransport = vi.hoisted(() => vi.fn());
const mockCreateWsfeService = vi.hoisted(() => vi.fn());
const mockCreateWsmtxcaService = vi.hoisted(() => vi.fn());
const mockCreatePadronService = vi.hoisted(() => vi.fn());

vi.mock("./config", () => ({
  assertArcaClientConfig: mockAssertArcaClientConfig,
  normalizeArcaClientConfig: mockNormalizeArcaClientConfig,
}));
vi.mock("./wsaa", () => ({
  createWsaaAuthModule: mockCreateWsaaAuthModule,
}));
vi.mock("./soap", () => ({
  createSoapTransport: mockCreateSoapTransport,
}));
vi.mock("./services/wsfe", () => ({
  createWsfeService: mockCreateWsfeService,
}));
vi.mock("./services/wsmtxca", () => ({
  createWsmtxcaService: mockCreateWsmtxcaService,
}));
vi.mock("./services/padron", () => ({
  createPadronService: mockCreatePadronService,
}));

import { createArcaClient } from "./client";

describe("createArcaClient", () => {
  it("validates config and wires every runtime module once", () => {
    const config = {
      taxId: "20123456789",
      certificatePem: "cert",
      privateKeyPem: "key",
      environment: "test" as const,
    };
    const auth = { login: vi.fn() };
    const soap = { execute: vi.fn() };
    const wsfe = { createNextVoucher: vi.fn() };
    const wsmtxca = { authorizeVoucher: vi.fn() };
    const padron = { getTaxpayerDetails: vi.fn() };

    mockCreateWsaaAuthModule.mockReturnValue(auth);
    mockCreateSoapTransport.mockReturnValue(soap);
    mockCreateWsfeService.mockReturnValue(wsfe);
    mockCreateWsmtxcaService.mockReturnValue(wsmtxca);
    mockCreatePadronService.mockReturnValue(padron);
    mockNormalizeArcaClientConfig.mockReturnValue(config);

    const client = createArcaClient(config);

    expect(mockAssertArcaClientConfig).toHaveBeenCalledWith(config);
    expect(mockNormalizeArcaClientConfig).toHaveBeenCalledWith(config);
    expect(mockCreateWsaaAuthModule).toHaveBeenCalledWith({ config });
    expect(mockCreateSoapTransport).toHaveBeenCalledWith({ config });
    expect(mockCreateWsfeService).toHaveBeenCalledWith({ config, auth, soap });
    expect(mockCreateWsmtxcaService).toHaveBeenCalledWith({
      config,
      auth,
      soap,
    });
    expect(mockCreatePadronService).toHaveBeenCalledWith({
      config,
      auth,
      soap,
    });
    expect(client).toEqual({
      config,
      wsfe,
      wsmtxca,
      padron,
    });
  });
});
