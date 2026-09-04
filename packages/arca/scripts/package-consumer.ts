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

// Compiled against the built package (not source path aliases).
export async function facadeConsumerContract(
  client: ReturnType<typeof createArcaClient>
) {
  const input = {
    issuer: "responsable_inscripto" as const,
    salesPoint: 1,
    to: { condition: "consumidor_final" as const },
    items: [{ gross: 12_100, vat: 21 as const }],
  };
  // @ts-expect-error A non-RI issuer cannot provide VAT items.
  await client.vouchers.issue({ ...input, issuer: "monotributo" });
  // @ts-expect-error An RI issuer cannot provide amount items.
  await client.vouchers.issue({ ...input, items: [{ amount: 10_000 }] });
  await client.vouchers.issue({
    ...input,
    // @ts-expect-error Mixed gross and net on one item is not an accepted union member.
    items: [{ gross: 100, net: 100, vat: 21 }],
  });

  const result = await client.vouchers.issue(input);
  // @ts-expect-error Exact input is opt-in and authorized-only.
  result.sent;
  switch (result.kind) {
    case "authorized":
      result.voucher.cae satisfies string;
      result.voucher.amounts.vatAdjustment satisfies number;
      if (result.recoveredByMatch) {
        result.attempt.reason satisfies string;
        result.lookup.number satisfies number;
        // @ts-expect-error Raw evidence is absent by default.
        result.lookup.raw;
      } else {
        result.authorization.cae satisfies string;
        // @ts-expect-error Raw evidence is absent by default.
        result.authorization.raw;
      }
      break;
    case "rejected":
      result.issues satisfies { message: string }[];
      result.attempted.number satisfies number;
      break;
    case "indeterminate":
      result.attempt.reason satisfies string;
      if (result.lookup.kind === "failed") {
        result.lookup.error.message satisfies string;
      }
      break;
    case "conflict":
      result.found.number satisfies number;
      result.reason satisfies string;
      break;
    default:
      result satisfies never;
  }
  const included = await client.vouchers.issue(input, {
    include: { exactInput: true, raw: true },
  });
  if (included.kind === "authorized") {
    included.sent satisfies WsfeVoucherInput;
    if (included.recoveredByMatch) {
      included.lookup.raw satisfies Record<string, unknown> | undefined;
      included.attempt.raw satisfies Record<string, unknown> | undefined;
    } else {
      included.authorization.raw satisfies Record<string, unknown> | undefined;
    }
  }
  return result;
}
