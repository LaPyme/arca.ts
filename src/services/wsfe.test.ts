import { describe, expect, it, vi } from "vitest";
import type { WsfeVoucherInput } from "./wsfe";
import { createWsfeService } from "./wsfe";

function createBaseOptions() {
  const auth = {
    login: vi.fn().mockResolvedValue({
      token: "token",
      sign: "sign",
      expiresAt: "2099-01-01T00:00:00Z",
    }),
  };
  const soap = {
    execute: vi.fn(),
  };

  return {
    config: {
      taxId: "20123456789",
      certificatePem: "cert",
      privateKeyPem: "key",
      environment: "test" as const,
    },
    auth,
    soap,
  };
}

function createBaseVoucherInput(
  overrides: Partial<WsfeVoucherInput> = {}
): WsfeVoucherInput {
  return {
    salesPoint: 1,
    voucherType: 6,
    concept: 1,
    documentType: 80,
    documentNumber: 30_717_329_654,
    receiverVatConditionId: 5,
    voucherDate: "20260501",
    totalAmount: 121,
    nonTaxableAmount: 0,
    netAmount: 100,
    exemptAmount: 0,
    taxAmount: 0,
    vatAmount: 21,
    currencyId: "PES",
    exchangeRate: 1,
    ...overrides,
  };
}

describe("createWsfeService", () => {
  it("creates the next voucher and wraps WSFE collection fields", async () => {
    const options = createBaseOptions();
    options.soap.execute
      .mockResolvedValueOnce({
        result: {
          FECompUltimoAutorizadoResponse: {
            FECompUltimoAutorizadoResult: {
              CbteNro: 41,
            },
          },
        },
      })
      .mockResolvedValueOnce({
        result: {
          FECAESolicitarResponse: {
            FECAESolicitarResult: {
              FeDetResp: {
                FECAEDetResponse: [
                  {
                    Resultado: "A",
                    CAE: "123456789",
                    CAEFchVto: "20260501",
                  },
                ],
              },
            },
          },
        },
      });

    const service = createWsfeService(options);
    const result = await service.createNextVoucher({
      representedTaxId: "20304050607",
      data: createBaseVoucherInput({
        associatedVouchers: [{ type: 1, salesPoint: 1, number: 1 }],
        taxes: [{ id: 99, baseAmount: 100, rate: 10, amount: 10 }],
        vatRates: [{ id: 5, baseAmount: 100, amount: 21 }],
        optionalFields: [{ id: "27", value: "test" }],
      }),
    });

    expect(result).toEqual({
      cae: "123456789",
      caeExpiry: "20260501",
      voucherNumber: 42,
      raw: {
        FeDetResp: {
          FECAEDetResponse: [
            {
              Resultado: "A",
              CAE: "123456789",
              CAEFchVto: "20260501",
            },
          ],
        },
      },
    });
    expect(options.auth.login).toHaveBeenNthCalledWith(1, "wsfe", {
      representedTaxId: "20304050607",
      forceRefresh: undefined,
    });
    expect(options.auth.login).toHaveBeenNthCalledWith(2, "wsfe", {
      representedTaxId: "20304050607",
    });
    expect(options.soap.execute.mock.calls[1]?.[0]).toMatchObject({
      service: "wsfe",
      operation: "FECAESolicitar",
      body: {
        Auth: {
          Token: "token",
          Sign: "sign",
          Cuit: 20_304_050_607,
        },
        FeCAEReq: {
          FeCabReq: {
            CantReg: 1,
            PtoVta: 1,
            CbteTipo: 6,
          },
          FeDetReq: {
            FECAEDetRequest: {
              CbteDesde: 42,
              CbteHasta: 42,
              CondicionIVAReceptorId: 5,
              CbtesAsoc: {
                CbteAsoc: [{ Tipo: 1, PtoVta: 1, Nro: 1 }],
              },
              Tributos: {
                Tributo: [{ Id: 99, BaseImp: 100, Alic: 10, Importe: 10 }],
              },
              Iva: {
                AlicIva: [{ Id: 5, BaseImp: 100, Importe: 21 }],
              },
              Opcionales: {
                Opcional: [{ Id: "27", Valor: "test" }],
              },
            },
          },
        },
      },
    });
  });

  it("normalizes supported date inputs before sending the SOAP request", async () => {
    const options = createBaseOptions();
    options.soap.execute
      .mockResolvedValueOnce({
        result: {
          FECompUltimoAutorizadoResponse: {
            FECompUltimoAutorizadoResult: {
              CbteNro: 41,
            },
          },
        },
      })
      .mockResolvedValueOnce({
        result: {
          FECAESolicitarResponse: {
            FECAESolicitarResult: {
              FeDetResp: {
                FECAEDetResponse: [
                  {
                    Resultado: "A",
                    CAE: "123456789",
                    CAEFchVto: "20260501",
                  },
                ],
              },
            },
          },
        },
      });

    const service = createWsfeService(options);
    await service.createNextVoucher({
      data: createBaseVoucherInput({
        voucherDate: "2026-05-01",
        serviceStartDate: "2026-05-01",
        serviceEndDate: "2026-05-31",
        paymentDueDate: "20260510",
        associatedVouchers: [
          {
            type: 1,
            salesPoint: 1,
            number: 1,
            voucherDate: "2026-04-30",
          },
        ],
      }),
    });

    expect(options.soap.execute.mock.calls[1]?.[0]).toMatchObject({
      body: {
        FeCAEReq: {
          FeDetReq: {
            FECAEDetRequest: {
              CbteFch: "20260501",
              FchServDesde: "20260501",
              FchServHasta: "20260531",
              FchVtoPago: "20260510",
              CbtesAsoc: {
                CbteAsoc: [
                  {
                    CbteFch: "20260430",
                  },
                ],
              },
            },
          },
        },
      },
    });
  });

  it("allows destructuring without breaking createNextVoucher", async () => {
    const options = createBaseOptions();
    options.soap.execute
      .mockResolvedValueOnce({
        result: {
          FECompUltimoAutorizadoResponse: {
            FECompUltimoAutorizadoResult: { CbteNro: 0 },
          },
        },
      })
      .mockResolvedValueOnce({
        result: {
          FECAESolicitarResponse: {
            FECAESolicitarResult: {
              FeDetResp: {
                FECAEDetResponse: [
                  { Resultado: "A", CAE: "999", CAEFchVto: "20260601" },
                ],
              },
            },
          },
        },
      });

    const { createNextVoucher } = createWsfeService(options);
    const result = await createNextVoucher({
      data: createBaseVoucherInput(),
    });

    expect(result.cae).toBe("999");
  });

  it("supports both next-voucher method names", async () => {
    const nextNumberOptions = createBaseOptions();
    nextNumberOptions.soap.execute.mockResolvedValue({
      result: {
        FECompUltimoAutorizadoResponse: {
          FECompUltimoAutorizadoResult: {
            CbteNro: 41,
          },
        },
      },
    });

    const service = createWsfeService(nextNumberOptions);

    await expect(
      service.getNextVoucherNumber({
        salesPoint: 1,
        voucherType: 6,
      })
    ).resolves.toBe(42);
    await expect(
      service.getLastVoucher({
        salesPoint: 1,
        voucherType: 6,
      })
    ).resolves.toBe(42);
  });

  it("raises service errors for rejected vouchers and missing CAE data", async () => {
    const rejectedOptions = createBaseOptions();
    rejectedOptions.soap.execute
      .mockResolvedValueOnce({
        result: {
          FECompUltimoAutorizadoResponse: {
            FECompUltimoAutorizadoResult: {
              CbteNro: 4,
            },
          },
        },
      })
      .mockResolvedValueOnce({
        result: {
          FECAESolicitarResponse: {
            FECAESolicitarResult: {
              FeDetResp: {
                FECAEDetResponse: {
                  Resultado: "R",
                  Observaciones: {
                    Obs: {
                      Code: 10_017,
                      Msg: "Comprobante rechazado",
                    },
                  },
                },
              },
            },
          },
        },
      });

    await expect(
      createWsfeService(rejectedOptions).createNextVoucher({
        data: createBaseVoucherInput(),
      })
    ).rejects.toMatchObject({
      name: "ArcaServiceError",
      serviceCode: "10017",
      message: "(10017) Comprobante rechazado",
    });

    const missingCaeOptions = createBaseOptions();
    missingCaeOptions.soap.execute
      .mockResolvedValueOnce({
        result: {
          FECompUltimoAutorizadoResponse: {
            FECompUltimoAutorizadoResult: {
              CbteNro: 9,
            },
          },
        },
      })
      .mockResolvedValueOnce({
        result: {
          FECAESolicitarResponse: {
            FECAESolicitarResult: {
              FeDetResp: {
                FECAEDetResponse: {
                  Resultado: "A",
                },
              },
            },
          },
        },
      });

    await expect(
      createWsfeService(missingCaeOptions).createNextVoucher({
        data: createBaseVoucherInput(),
      })
    ).rejects.toMatchObject({
      name: "ArcaServiceError",
      message: "WSFE did not return CAE authorization data",
    });
  });

  it("fails fast on invalid public date inputs", async () => {
    const options = createBaseOptions();
    const service = createWsfeService(options);

    await expect(
      service.createNextVoucher({
        data: createBaseVoucherInput({
          voucherDate: "05/01/2026" as never,
        }),
      })
    ).rejects.toMatchObject({
      name: "ArcaInputError",
      code: "ARCA_INPUT_ERROR",
      message:
        "Invalid WSFE voucherDate: expected a YYYY-MM-DD or YYYYMMDD string",
    });

    expect(options.auth.login).not.toHaveBeenCalled();
    expect(options.soap.execute).not.toHaveBeenCalled();
  });

  it("rejects non-string date values from untyped callers", async () => {
    const options = createBaseOptions();
    const service = createWsfeService(options);

    await expect(
      service.createNextVoucher({
        data: createBaseVoucherInput({
          voucherDate: new Date(2026, 4, 1) as never,
        }),
      })
    ).rejects.toMatchObject({
      name: "ArcaInputError",
      code: "ARCA_INPUT_ERROR",
      message:
        "Invalid WSFE voucherDate: expected a YYYY-MM-DD or YYYYMMDD string",
    });

    expect(options.auth.login).not.toHaveBeenCalled();
    expect(options.soap.execute).not.toHaveBeenCalled();
  });

  it("supports querying sales points and voucher information", async () => {
    const options = createBaseOptions();
    options.soap.execute
      .mockResolvedValueOnce({
        result: {
          FEParamGetPtosVentaResponse: {
            FEParamGetPtosVentaResult: {
              ResultGet: {
                PtoVenta: [{ Nro: 1 }, { Nro: 2 }],
              },
            },
          },
        },
      })
      .mockResolvedValueOnce({
        result: {
          FECompConsultarResponse: {
            FECompConsultarResult: {
              ResultGet: {
                CbteDesde: 77,
                CbteHasta: 77,
                Resultado: "A",
              },
            },
          },
        },
      });

    const service = createWsfeService(options);

    await expect(
      service.getSalesPoints({
        representedTaxId: "20304050607",
        forceAuthRefresh: true,
      })
    ).resolves.toEqual([{ number: 1 }, { number: 2 }]);

    const singlePointOptions = createBaseOptions();
    singlePointOptions.soap.execute.mockResolvedValueOnce({
      result: {
        FEParamGetPtosVentaResponse: {
          FEParamGetPtosVentaResult: {
            ResultGet: {
              PtoVenta: {
                Nro: "1",
                EmisionTipo: "CAE - Monotributo",
                Bloqueado: "N",
                FchBaja: "NULL",
              },
            },
          },
        },
      },
    });
    await expect(
      createWsfeService(singlePointOptions).getSalesPoints({})
    ).resolves.toEqual([
      {
        number: 1,
        emissionType: "CAE - Monotributo",
        blocked: "N",
        deletedSince: "NULL",
      },
    ]);

    await expect(
      service.getVoucherInfo({
        representedTaxId: "20304050607",
        number: 77,
        salesPoint: 1,
        voucherType: 6,
      })
    ).resolves.toEqual({
      voucherNumber: 77,
      result: "A",
      raw: {
        CbteDesde: 77,
        CbteHasta: 77,
        Resultado: "A",
      },
    });
  });

  it("raises service errors when WSFE returns error lists", async () => {
    const options = createBaseOptions();
    options.soap.execute.mockResolvedValueOnce({
      result: {
        FEParamGetPtosVentaResponse: {
          FEParamGetPtosVentaResult: {
            Errors: {
              Err: {
                Code: 500,
                Msg: "Servicio no disponible",
              },
            },
          },
        },
      },
    });

    await expect(
      createWsfeService(options).getSalesPoints({})
    ).rejects.toMatchObject({
      name: "ArcaServiceError",
      serviceCode: "500",
      message: "(500) Servicio no disponible",
    });
  });
});
