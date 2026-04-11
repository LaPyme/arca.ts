import { describe, expect, it, vi } from "vitest";
import { createWsmtxcaService } from "./wsmtxca";

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
      execute: vi.fn().mockResolvedValue({
        result: {
          ok: true,
        },
      }),
    },
  };
}

describe("createWsmtxcaService", () => {
  it("authorizes vouchers using prefixed WSMTXCA operations", async () => {
    const options = createBaseOptions();
    options.soap.execute.mockResolvedValueOnce({
      result: {
        autorizarComprobanteResponse: {
          resultado: "O",
          comprobanteResponse: {
            CAE: "12345678901234",
            fechaVencimientoCAE: "20260301",
            numeroComprobante: "11",
          },
        },
      },
    });
    const service = createWsmtxcaService(options);

    await expect(
      service.authorizeVoucher({
        representedTaxId: "20304050607",
        data: {
          comprobanteCAERequest: {
            numeroComprobante: 11,
          },
        },
      })
    ).resolves.toEqual({
      cae: "12345678901234",
      caeExpiry: "2026-03-01",
      voucherNumber: 11,
      messages: [],
      raw: {
        resultado: "O",
        comprobanteResponse: {
          CAE: "12345678901234",
          fechaVencimientoCAE: "20260301",
          numeroComprobante: "11",
        },
      },
    });

    expect(options.auth.login).toHaveBeenCalledWith("wsmtxca", {
      representedTaxId: "20304050607",
    });
    expect(options.soap.execute).toHaveBeenCalledWith({
      service: "wsmtxca",
      operation: "autorizarComprobante",
      bodyElementName: "autorizarComprobanteRequest",
      bodyElementNamespaceMode: "prefix",
      body: {
        authRequest: {
          token: "token",
          sign: "sign",
          cuitRepresentada: 20_304_050_607,
        },
        comprobanteCAERequest: {
          numeroComprobante: 11,
        },
      },
    });
  });

  it("queries the last authorized voucher using the default tax id", async () => {
    const options = createBaseOptions();
    options.soap.execute.mockResolvedValueOnce({
      result: {
        consultarUltimoComprobanteAutorizadoResponse: {
          numeroComprobante: "4",
        },
      },
    });
    const service = createWsmtxcaService(options);

    await expect(
      service.getLastAuthorizedVoucher({
        voucherType: 1,
        salesPoint: 4,
      })
    ).resolves.toEqual({
      voucherNumber: 4,
      raw: {
        numeroComprobante: "4",
      },
    });

    expect(options.soap.execute).toHaveBeenCalledWith({
      service: "wsmtxca",
      operation: "consultarUltimoComprobanteAutorizado",
      bodyElementName: "consultarUltimoComprobanteAutorizadoRequest",
      bodyElementNamespaceMode: "prefix",
      body: {
        authRequest: {
          token: "token",
          sign: "sign",
          cuitRepresentada: 20_123_456_789,
        },
        consultaUltimoComprobanteAutorizadoRequest: {
          codigoTipoComprobante: 1,
          numeroPuntoVenta: 4,
        },
      },
    });
  });

  it("queries a specific voucher", async () => {
    const options = createBaseOptions();
    options.soap.execute.mockResolvedValueOnce({
      result: {
        consultarComprobanteResponse: {
          comprobanteResponse: {
            fechaEmision: "20260301",
          },
        },
      },
    });
    const service = createWsmtxcaService(options);

    await expect(
      service.getVoucher({
        representedTaxId: "20304050607",
        voucherType: 6,
        salesPoint: 8,
        voucherNumber: 25,
      })
    ).resolves.toEqual({
      invoiceDate: "2026-03-01",
      voucher: {
        fechaEmision: "20260301",
      },
      messages: [],
      raw: {
        comprobanteResponse: {
          fechaEmision: "20260301",
        },
      },
    });

    expect(options.soap.execute).toHaveBeenCalledWith({
      service: "wsmtxca",
      operation: "consultarComprobante",
      bodyElementName: "consultarComprobanteRequest",
      bodyElementNamespaceMode: "prefix",
      body: {
        authRequest: {
          token: "token",
          sign: "sign",
          cuitRepresentada: 20_304_050_607,
        },
        consultaComprobanteRequest: {
          codigoTipoComprobante: 6,
          numeroPuntoVenta: 8,
          numeroComprobante: 25,
        },
      },
    });
  });

  it("raises service errors for rejected authorizations", async () => {
    const options = createBaseOptions();
    options.soap.execute.mockResolvedValueOnce({
      result: {
        autorizarComprobanteResponse: {
          resultado: "R",
          arrayErrores: {
            codigoDescripcion: [
              {
                codigo: 514,
                descripcion: "El Importe IVA del ítem no debe informarse",
              },
            ],
          },
          arrayObservaciones: {
            codigoDescripcion: {
              codigo: 504,
              descripcion: "Código de producto sin GS1 válido",
            },
          },
        },
      },
    });

    await expect(
      createWsmtxcaService(options).authorizeVoucher({
        data: {
          comprobanteCAERequest: {
            numeroComprobante: 9,
          },
        },
      })
    ).rejects.toMatchObject({
      name: "ArcaServiceError",
      message:
        "Error 514: El Importe IVA del ítem no debe informarse | Obs 504: Código de producto sin GS1 válido",
    });
  });

  it("rejects malformed last-voucher and voucher lookup responses", async () => {
    const options = createBaseOptions();
    options.soap.execute
      .mockResolvedValueOnce({
        result: {
          consultarUltimoComprobanteAutorizadoResponse: {},
        },
      })
      .mockResolvedValueOnce({
        result: {
          consultarComprobanteResponse: {},
        },
      });

    const service = createWsmtxcaService(options);

    await expect(
      service.getLastAuthorizedVoucher({
        voucherType: 1,
        salesPoint: 4,
      })
    ).rejects.toMatchObject({
      name: "ArcaServiceError",
      message: "WSMTXCA did not return the last authorized voucher number",
    });

    await expect(
      service.getVoucher({
        voucherType: 6,
        salesPoint: 8,
        voucherNumber: 25,
      })
    ).rejects.toMatchObject({
      name: "ArcaServiceError",
      message: "WSMTXCA did not return the voucher issue date",
    });
  });
});
