import { describe, expect, it } from "vitest";
import { createArcaClient } from "./client";
import * as arca from "./index";
import * as padronBarrel from "./padron";
import { createPadronService } from "./services/padron";
import { createWsfeService } from "./services/wsfe";
import { createWsmtxcaService } from "./services/wsmtxca";
import * as wsfeBarrel from "./wsfe";
import * as wsmtxcaBarrel from "./wsmtxca";

describe("barrel exports", () => {
  it("re-exports runtime factories from the package entrypoints", () => {
    expect(arca.createArcaClient).toBe(createArcaClient);
    expect(arca.createArcaClientConfigFromEnv).toBeTypeOf("function");
    expect(arca.createPadronService).toBe(createPadronService);
    expect(arca.createWsfeService).toBe(createWsfeService);
    expect(arca.createWsmtxcaService).toBe(createWsmtxcaService);
    expect(padronBarrel.createPadronService).toBe(createPadronService);
    expect(wsfeBarrel.createWsfeService).toBe(createWsfeService);
    expect(wsmtxcaBarrel.createWsmtxcaService).toBe(createWsmtxcaService);
    expect(arca.ARCA_ENVIRONMENTS).toEqual(["production", "test"]);
    expect(arca.ARCA_ENV_VARIABLES.environment).toBe("ARCA_ENVIRONMENT");
  });
});
