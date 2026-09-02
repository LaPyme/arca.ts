import {
  ArcaAuthenticationError,
  ArcaInputError,
  buildFacturaB,
  buildFacturaC,
  createArcaClient,
  isArcaAuthenticationError,
  type WsfeAuthorizationOutcome,
  type WsfeAuthorizeVoucherInput,
  type WsfeVoucherInput,
} from "facturas";
import { ARCA_CURRENCY_IDS, ISO_CURRENCIES } from "facturas/constants";
import {
  ArcaAuthenticationError as SubpathAuthenticationError,
  ArcaInputError as SubpathInputError,
} from "facturas/errors";
import {
  buildFacturaB as buildFacturaBFromWsfe,
  buildFacturaC as buildFacturaCFromWsfe,
  type WsfeAuthorizeVoucherInput as SubpathAuthorizeVoucherInput,
  type WsfeVoucherInput as SubpathVoucherInput,
} from "facturas/wsfe";

const facturaB = buildFacturaB({
  salesPoint: 1,
  concept: 1,
  documentType: 99,
  documentNumber: 0,
  receiverVatConditionId: 5,
  voucherDate: "2026-09-02",
  taxableAmount: 10_000,
  vatRate: 21,
  currency: ISO_CURRENCIES.ARS,
});
const facturaC = buildFacturaCFromWsfe({
  salesPoint: 1,
  concept: 1,
  documentType: 99,
  documentNumber: 0,
  receiverVatConditionId: 5,
  voucherDate: "2026-09-02",
  amount: 10_000,
  currency: ISO_CURRENCIES.USD,
  exchangeRate: "1095.5",
});
const exactInput: WsfeVoucherInput = facturaB;
const subpathExactInput: SubpathVoucherInput = facturaC;
const authorizationInput: WsfeAuthorizeVoucherInput = {
  data: exactInput,
  voucherNumber: 1,
};
const subpathAuthorizationInput: SubpathAuthorizeVoucherInput = {
  data: subpathExactInput,
  voucherNumber: 2,
};
const inputError = new ArcaInputError("invalid date", {
  code: "ARCA_INPUT_INVALID_DATE",
  field: "voucherDate",
});
const authenticationError = new ArcaAuthenticationError(
  "authentication rejected",
  {
    reason: "invalid_token",
    service: "wsfe",
    operation: "FECAESolicitar",
    providerCode: 600,
  }
);
const outcome: WsfeAuthorizationOutcome = {
  kind: "indeterminate",
  service: "wsfe",
  operation: "FECAESolicitar",
  results: {},
  errors: [],
  observations: [],
  reason: "authentication_rejected",
  authentication: {
    code: "ARCA_AUTHENTICATION_ERROR",
    reason: "invalid_token",
    providerCode: "600",
  },
};

export const packageConsumerContract = {
  createArcaClient,
  buildFacturaBFromWsfe,
  buildFacturaC,
  authorizationInput,
  subpathAuthorizationInput,
  inputError,
  authenticationError,
  outcome,
  isArcaAuthenticationError,
  SubpathAuthenticationError,
  SubpathInputError,
  arcaCurrencyId: ARCA_CURRENCY_IDS.ARS,
};
