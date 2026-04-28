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

function createWsfeOperationResult(
  operation: string,
  result: Record<string, unknown>
) {
  return {
    result: {
      [`${operation}Response`]: {
        [`${operation}Result`]: result,
      },
    },
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
        currencyId: "USD",
        associatedVouchers: [{ type: 1, salesPoint: 1, number: 1 }],
        taxes: [{ id: 99, baseAmount: 100, rate: 10, amount: 10 }],
        vatRates: [{ id: 5, baseAmount: 100, amount: 21 }],
        optionalFields: [{ id: "27", value: "test" }],
        activities: [{ id: 46_123 }],
        sameCurrencyForeignCancellation: "S",
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
              CanMisMonExt: "S",
              MonId: "USD",
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
              Actividades: {
                Actividad: [{ Id: 46_123 }],
              },
            },
          },
        },
      },
    });
  });

  it("omits MonCotiz when foreign-currency vouchers are cancelled in the same currency", async () => {
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

    await createWsfeService(options).createNextVoucher({
      data: createBaseVoucherInput({
        currencyId: "USD",
        exchangeRate: undefined,
        sameCurrencyForeignCancellation: "S",
      }),
    });

    const request = options.soap.execute.mock.calls[1]?.[0].body.FeCAEReq
      .FeDetReq.FECAEDetRequest;

    expect(request).toMatchObject({
      MonId: "USD",
      CanMisMonExt: "S",
    });
    expect(request).not.toHaveProperty("MonCotiz");
  });

  it("does not send CanMisMonExt for peso vouchers", async () => {
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

    await createWsfeService(options).createNextVoucher({
      data: createBaseVoucherInput({
        sameCurrencyForeignCancellation: "S",
      }),
    });

    const request = options.soap.execute.mock.calls[1]?.[0].body.FeCAEReq
      .FeDetReq.FECAEDetRequest;

    expect(request).toMatchObject({
      MonId: "PES",
      MonCotiz: 1,
    });
    expect(request).not.toHaveProperty("CanMisMonExt");
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

  it("sends PeriodoAsoc with normalized dates when provided", async () => {
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
        associatedPeriod: {
          startDate: "2026-05-01",
          endDate: "20260531",
        },
      }),
    });

    expect(options.soap.execute.mock.calls[1]?.[0]).toMatchObject({
      body: {
        FeCAEReq: {
          FeDetReq: {
            FECAEDetRequest: {
              PeriodoAsoc: {
                FchDesde: "20260501",
                FchHasta: "20260531",
              },
            },
          },
        },
      },
    });
  });

  it("rejects invalid associated period dates before SOAP calls", async () => {
    const options = createBaseOptions();
    const service = createWsfeService(options);

    await expect(
      service.createNextVoucher({
        data: createBaseVoucherInput({
          associatedPeriod: {
            startDate: "05/01/2026" as never,
            endDate: "20260531",
          },
        }),
      })
    ).rejects.toMatchObject({
      name: "ArcaInputError",
      code: "ARCA_INPUT_ERROR",
      message:
        "Invalid WSFE associatedPeriod.startDate: expected a YYYY-MM-DD or YYYYMMDD string",
    });

    expect(options.auth.login).not.toHaveBeenCalled();
    expect(options.soap.execute).not.toHaveBeenCalled();
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

  it.each([
    {
      name: "voucher types",
      method: "getVoucherTypes",
      operation: "FEParamGetTiposCbte",
      resultKey: "CbteTipo",
      rawEntry: { Id: 1, Desc: "Factura A" },
      expected: [{ id: 1, description: "Factura A" }],
    },
    {
      name: "document types",
      method: "getDocumentTypes",
      operation: "FEParamGetTiposDoc",
      resultKey: "DocTipo",
      rawEntry: { Id: 80, Desc: "CUIT" },
      expected: [{ id: 80, description: "CUIT" }],
    },
    {
      name: "concept types",
      method: "getConceptTypes",
      operation: "FEParamGetTiposConcepto",
      resultKey: "ConceptoTipo",
      rawEntry: { Id: 2, Desc: "Servicios" },
      expected: [{ id: 2, description: "Servicios" }],
    },
    {
      name: "vat rates",
      method: "getVatRates",
      operation: "FEParamGetTiposIva",
      resultKey: "IvaTipo",
      rawEntry: { Id: "5", Desc: "21%" },
      expected: [{ id: 5, description: "21%" }],
    },
    {
      name: "tax types",
      method: "getTaxTypes",
      operation: "FEParamGetTiposTributos",
      resultKey: "TributoTipo",
      rawEntry: { Id: 99, Desc: "Impuesto municipal" },
      expected: [{ id: 99, description: "Impuesto municipal" }],
    },
    {
      name: "optional field types",
      method: "getOptionalTypes",
      operation: "FEParamGetTiposOpcional",
      resultKey: "OpcionalTipo",
      rawEntry: { Id: "27", Desc: "Referencia comercial" },
      expected: [{ id: 27, description: "Referencia comercial" }],
    },
  ])("retrieves %s", async ({
    method,
    operation,
    resultKey,
    rawEntry,
    expected,
  }) => {
    const options = createBaseOptions();
    options.soap.execute.mockResolvedValueOnce(
      createWsfeOperationResult(operation, {
        ResultGet: {
          [resultKey]: rawEntry,
        },
      })
    );

    const service = createWsfeService(options);
    const execute = service[method as keyof typeof service] as (input: {
      representedTaxId?: number | string;
      forceAuthRefresh?: boolean;
    }) => Promise<unknown>;

    await expect(
      execute({
        representedTaxId: "20304050607",
        forceAuthRefresh: true,
      })
    ).resolves.toEqual(expected);
    expect(options.auth.login).toHaveBeenCalledWith("wsfe", {
      representedTaxId: "20304050607",
      forceRefresh: true,
    });
    expect(options.soap.execute).toHaveBeenCalledWith({
      service: "wsfe",
      operation,
      body: {
        Auth: {
          Token: "token",
          Sign: "sign",
          Cuit: 20_304_050_607,
        },
      },
    });
  });

  it("retrieves currency types", async () => {
    const options = createBaseOptions();
    options.soap.execute.mockResolvedValueOnce(
      createWsfeOperationResult("FEParamGetTiposMonedas", {
        ResultGet: {
          Moneda: {
            Id: "USD",
            Desc: "Dolar Estadounidense",
            FchDesde: "20200101",
            FchHasta: "NULL",
          },
        },
      })
    );

    const service = createWsfeService(options);

    await expect(
      service.getCurrencyTypes({
        representedTaxId: "20304050607",
        forceAuthRefresh: true,
      })
    ).resolves.toEqual([
      {
        id: "USD",
        description: "Dolar Estadounidense",
        validFrom: "20200101",
        validTo: "NULL",
      },
    ]);
    expect(options.auth.login).toHaveBeenCalledWith("wsfe", {
      representedTaxId: "20304050607",
      forceRefresh: true,
    });
    expect(options.soap.execute).toHaveBeenCalledWith({
      service: "wsfe",
      operation: "FEParamGetTiposMonedas",
      body: {
        Auth: {
          Token: "token",
          Sign: "sign",
          Cuit: 20_304_050_607,
        },
      },
    });
  });

  it("retrieves activities", async () => {
    const options = createBaseOptions();
    options.soap.execute.mockResolvedValueOnce(
      createWsfeOperationResult("FEParamGetActividades", {
        ResultGet: {
          ActividadesTipo: {
            Id: "46123",
            Orden: "1",
            Desc: "Venta al por menor",
          },
        },
      })
    );

    const service = createWsfeService(options);

    await expect(
      service.getActivities({
        representedTaxId: "20304050607",
        forceAuthRefresh: true,
      })
    ).resolves.toEqual([
      {
        id: 46_123,
        description: "Venta al por menor",
        order: 1,
      },
    ]);
    expect(options.auth.login).toHaveBeenCalledWith("wsfe", {
      representedTaxId: "20304050607",
      forceRefresh: true,
    });
    expect(options.soap.execute).toHaveBeenCalledWith({
      service: "wsfe",
      operation: "FEParamGetActividades",
      body: {
        Auth: {
          Token: "token",
          Sign: "sign",
          Cuit: 20_304_050_607,
        },
      },
    });
  });

  it("retrieves receiver VAT conditions", async () => {
    const options = createBaseOptions();
    options.soap.execute.mockResolvedValueOnce(
      createWsfeOperationResult("FEParamGetCondicionIvaReceptor", {
        ResultGet: {
          CondicionIvaReceptor: {
            Id: "1",
            Desc: "IVA Responsable Inscripto",
            Cmp_Clase: "A",
          },
        },
      })
    );

    const service = createWsfeService(options);

    await expect(
      service.getReceiverVatConditions({
        representedTaxId: "20304050607",
        voucherClass: "A",
        forceAuthRefresh: true,
      })
    ).resolves.toEqual([
      {
        id: 1,
        description: "IVA Responsable Inscripto",
        voucherClass: "A",
      },
    ]);
    expect(options.auth.login).toHaveBeenCalledWith("wsfe", {
      representedTaxId: "20304050607",
      forceRefresh: true,
    });
    expect(options.soap.execute).toHaveBeenCalledWith({
      service: "wsfe",
      operation: "FEParamGetCondicionIvaReceptor",
      body: {
        Auth: {
          Token: "token",
          Sign: "sign",
          Cuit: 20_304_050_607,
        },
        ClaseCmp: "A",
      },
    });
  });

  it("retrieves server status", async () => {
    const options = createBaseOptions();
    options.soap.execute.mockResolvedValueOnce(
      createWsfeOperationResult("FEDummy", {
        AppServer: "OK",
        DbServer: "OK",
        AuthServer: "OK",
      })
    );

    const service = createWsfeService(options);

    await expect(service.getServerStatus()).resolves.toEqual({
      appServer: "OK",
      dbServer: "OK",
      authServer: "OK",
    });
    expect(options.auth.login).not.toHaveBeenCalled();
    expect(options.soap.execute).toHaveBeenCalledWith({
      service: "wsfe",
      operation: "FEDummy",
      body: {},
    });
  });

  it("retrieves quotations", async () => {
    const options = createBaseOptions();
    options.soap.execute.mockResolvedValueOnce(
      createWsfeOperationResult("FEParamGetCotizacion", {
        ResultGet: {
          MonId: "USD",
          MonCotiz: 1095.5,
          FchCotiz: "20260501",
        },
      })
    );

    const service = createWsfeService(options);

    await expect(
      service.getQuotation({
        currencyId: "USD",
        representedTaxId: "20304050607",
        forceAuthRefresh: true,
      })
    ).resolves.toEqual({
      currencyId: "USD",
      rate: 1095.5,
      date: "20260501",
    });
    expect(options.auth.login).toHaveBeenCalledWith("wsfe", {
      representedTaxId: "20304050607",
      forceRefresh: true,
    });
    expect(options.soap.execute).toHaveBeenCalledWith({
      service: "wsfe",
      operation: "FEParamGetCotizacion",
      body: {
        Auth: {
          Token: "token",
          Sign: "sign",
          Cuit: 20_304_050_607,
        },
        MonId: "USD",
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
