import { describe, expect, it } from "vitest";
import {
  ARCA_ENVIRONMENTS,
  ARCA_ENV_VARIABLES,
  ARCA_WSAA_CONFIG,
  assertArcaClientConfig,
  createArcaClientConfigFromEnv,
  getArcaServiceConfig,
  resolveArcaEnvironment,
} from "./config";
import { ArcaConfigurationError } from "./errors";

describe("config", () => {
  it("resolves the target environment", () => {
    expect(ARCA_ENVIRONMENTS).toEqual(["production", "test"]);
    expect(resolveArcaEnvironment(true)).toBe("production");
    expect(resolveArcaEnvironment(false)).toBe("test");
  });

  it("accepts a complete client config", () => {
    expect(() =>
      assertArcaClientConfig({
        taxId: "20123456789",
        certificatePem: "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----",
        privateKeyPem: "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----",
        environment: "test",
      })
    ).not.toThrow();
  });

  it("rejects incomplete or invalid client config fields", () => {
    expect(() =>
      assertArcaClientConfig({
        taxId: " ",
        certificatePem: "",
        privateKeyPem: " ",
        environment: "sandbox" as "test",
      })
    ).toThrowError(
      new ArcaConfigurationError(
        "Missing or invalid ARCA client config fields: taxId, certificatePem, privateKeyPem, environment"
      )
    );
  });

  it("requires an explicit directory for disk-backed WSAA cache", () => {
    expect(() =>
      assertArcaClientConfig({
        taxId: "20123456789",
        certificatePem: "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----",
        privateKeyPem: "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----",
        environment: "test",
        wsaa: {
          cache: {
            mode: "disk",
            directory: " ",
          },
        },
      })
    ).toThrowError(
      new ArcaConfigurationError(
        "Missing or invalid ARCA client config fields: wsaa.cache.directory"
      )
    );
  });

  it("builds a client config from environment variables", () => {
    const envConfig = createArcaClientConfigFromEnv({
      env: {
        [ARCA_ENV_VARIABLES.taxId]: "20123456789",
        [ARCA_ENV_VARIABLES.certificatePem]:
          "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----",
        [ARCA_ENV_VARIABLES.privateKeyPem]:
          "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----",
        [ARCA_ENV_VARIABLES.wsaaCacheMode]: "disk",
        [ARCA_ENV_VARIABLES.wsaaCacheDirectory]: "/tmp/arca-cache",
      },
    });

    expect(envConfig).toEqual({
      taxId: "20123456789",
      certificatePem:
        "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----",
      privateKeyPem:
        "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----",
      environment: "test",
      wsaa: {
        cache: {
          mode: "disk",
          directory: "/tmp/arca-cache",
        },
      },
    });
  });

  it("rejects invalid environment values loaded from env helpers", () => {
    expect(() =>
      createArcaClientConfigFromEnv({
        env: {
          [ARCA_ENV_VARIABLES.taxId]: "20123456789",
          [ARCA_ENV_VARIABLES.certificatePem]:
            "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----",
          [ARCA_ENV_VARIABLES.privateKeyPem]:
            "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----",
          [ARCA_ENV_VARIABLES.environment]: "sandbox",
        },
      })
    ).toThrowError(
      new ArcaConfigurationError(
        "Missing or invalid ARCA client config fields: environment"
      )
    );
  });

  it("returns service metadata and rejects unsupported services", () => {
    expect(ARCA_WSAA_CONFIG).toMatchObject({
      soapVersion: "1.1",
      usesEmptySoapAction: true,
    });
    expect(getArcaServiceConfig("wsfe")).toMatchObject({
      soapVersion: "1.2",
      useLegacyTlsSecurityLevel0: true,
      endpoint: expect.objectContaining({
        production: expect.stringContaining("wsfev1"),
        test: expect.stringContaining("wsfev1"),
      }),
    });
    expect(getArcaServiceConfig("padron-a13")).toMatchObject({
      usesEmptySoapAction: true,
    });
    expect(() => getArcaServiceConfig("unsupported" as never)).toThrowError(
      new ArcaConfigurationError(
        "Unsupported ARCA service configuration: unsupported"
      )
    );
  });
});
