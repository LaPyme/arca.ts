import { describe, expect, it, vi } from "vitest";
import { ArcaSoapFaultError } from "../errors";
import { createPadronService } from "./padron";

function createBaseOptions() {
  return {
    config: {
      taxId: "20123456789",
      certificatePem: "cert",
      privateKeyPem: "key",
      environment: "test" as const,
    },
    auth: {
      login: vi.fn().mockResolvedValue({
        token: "token",
        sign: "sign",
        expiresAt: "2099-01-01T00:00:00Z",
      }),
    },
    soap: {
      execute: vi.fn(),
    },
  };
}

describe("createPadronService", () => {
  it("gets taxpayer details through padron-a5", async () => {
    const options = createBaseOptions();
    options.soap.execute.mockResolvedValueOnce({
      result: {
        personaReturn: {
          idPersona: "20123456789",
        },
      },
    });

    const service = createPadronService(options);
    await expect(service.getTaxpayerDetails(20_123_456_789)).resolves.toEqual({
      idPersona: "20123456789",
    });

    expect(options.auth.login).toHaveBeenCalledWith(
      "ws_sr_constancia_inscripcion"
    );
    expect(options.soap.execute).toHaveBeenCalledWith({
      service: "padron-a5",
      operation: "getPersona_v2",
      bodyElementNamespaceMode: "prefix",
      body: {
        token: "token",
        sign: "sign",
        cuitRepresentada: 20_123_456_789,
        idPersona: 20_123_456_789,
      },
    });
  });

  it("gets tax ids by document through padron-a13", async () => {
    const options = createBaseOptions();
    options.soap.execute.mockResolvedValueOnce({
      result: {
        idPersonaListReturn: {
          idPersona: ["20123456789", "20999888777"],
        },
      },
    });

    const service = createPadronService(options);
    await expect(service.getTaxIdByDocument(12_345_678)).resolves.toEqual([
      "20123456789",
      "20999888777",
    ]);

    expect(options.auth.login).toHaveBeenCalledWith("ws_sr_padron_a13");
  });

  it("returns null on not-found SOAP faults and rethrows other SOAP faults", async () => {
    const options = createBaseOptions();
    const service = createPadronService(options);

    options.soap.execute.mockRejectedValueOnce(
      new ArcaSoapFaultError("Persona no existe")
    );
    await expect(service.getTaxpayerDetails(99_999_999)).resolves.toBeNull();

    const fatalFault = new ArcaSoapFaultError("Servicio caido");
    options.soap.execute.mockRejectedValueOnce(fatalFault);
    await expect(service.getTaxIdByDocument(12_345_678)).rejects.toBe(
      fatalFault
    );
  });
});
