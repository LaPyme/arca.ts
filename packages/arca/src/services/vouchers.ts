import {
  ArcaInputError,
  ArcaServiceError,
  toArcaSafeErrorMetadata,
} from "../errors";
import type { ArcaAuthorizationOutcome } from "./fiscal-evidence";
import type {
  IssuedVoucher,
  IssueOptions,
  IssueOutcome,
} from "./vouchers-types";
import type { WsfeService, WsfeVoucherInput } from "./wsfe";
import {
  assertIssueKeys,
  assertIssueObject,
  deriveWsfeInvoice,
  type IssueInput,
  issueDocumentNumber,
} from "./wsfe-derive";
import {
  matchWsfeVoucherIdentity,
  toVoucherSummary,
  type VoucherCoordinates,
} from "./wsfe-identity";

export type VouchersService = {
  /**
   * Single-writer contract: serialize calls per (representedTaxId, salesPoint,
   * voucherType), including concurrent promises in one process. The SDK does not
   * coordinate writers; uncoordinated calls collide on ARCA 10016. Servers and
   * queues must persist attempts and use wsfe.authorizeVoucherOutcome() directly.
   * See the "does not serialize concurrent calls" test in services/vouchers.test.ts.
   *
   * One next-number read, one authorization attempt (zero transport retries), and
   * at most one identity-matched lookup after indeterminate. Never resubmits.
   * Local validation and next-number read failures throw before authorization.
   */
  issue<O extends IssueOptions = { include?: never }>(
    input: IssueInput,
    options?: O
  ): Promise<IssueOutcome<O>>;
};

type IssueWsfeService = Pick<
  WsfeService,
  "getNextVoucherNumber" | "authorizeVoucherOutcome" | "lookupVoucher"
>;
const SERIALIZATION_NOTICE =
  "Serialize calls per (representedTaxId, salesPoint, voucherType). The SDK does not coordinate writers; uncoordinated calls collide on 10016. Servers and queues must persist attempts and use wsfe.authorizeVoucherOutcome().";

export function createVouchersService(wsfe: IssueWsfeService): VouchersService {
  return {
    issue: async <O extends IssueOptions = { include?: never }>(
      input: IssueInput,
      options?: O
    ): Promise<IssueOutcome<O>> => {
      const result = await issueInvoice(
        wsfe,
        input,
        options === undefined ? {} : options
      );
      // issueInvoice conditionally adds the fields specified by O at runtime.
      return result as IssueOutcome<O>;
    },
  };
}

async function issueInvoice(
  wsfe: IssueWsfeService,
  input: IssueInput,
  options: IssueOptions
): Promise<IssueOutcome<IssueOptions>> {
  validateOptions(options);
  const { data, voucherClass, amounts } = deriveWsfeInvoice(input);
  const auth = {
    representedTaxId: options.representedTaxId,
    forceRefresh: options.forceRefresh,
  };
  const includeRaw = options.include?.raw === true;
  const includeExact = options.include?.exactInput === true;
  const number = await wsfe.getNextVoucherNumber({
    ...auth,
    salesPoint: data.salesPoint,
    voucherType: data.voucherType,
  });
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new ArcaServiceError(
      "WSFE returned an invalid next voucher number.",
      {
        service: "wsfe",
        operation: "FECompUltimoAutorizado",
      }
    );
  }
  const attempted = {
    salesPoint: data.salesPoint,
    voucherType: data.voucherType,
    number,
  };
  const exact = includeExact ? { sent: data } : {};
  // This is the only authorization call, including all transport/recovery branches.
  const authorization = await wsfe.authorizeVoucherOutcome({
    ...auth,
    data,
    voucherNumber: number,
  });
  const voucher = (cae: string, caeExpiry: string): IssuedVoucher => ({
    ...attempted,
    voucherClass,
    date: data.voucherDate,
    cae,
    caeExpiry,
    amounts,
  });
  if (
    authorization.kind === "authorized" &&
    authorization.caeExpiry &&
    authorization.voucherNumber === number
  ) {
    return {
      kind: "authorized",
      recoveredByMatch: false,
      voucher: voucher(authorization.cae, authorization.caeExpiry),
      authorization: projectEvidence(authorization, includeRaw),
      ...exact,
    };
  }
  if (authorization.kind === "rejected") {
    return {
      kind: "rejected",
      attempted,
      issues: [...authorization.errors, ...authorization.observations].map(
        projectIssue
      ),
      authorization: projectEvidence(authorization, includeRaw),
    };
  }
  // The exact outcome type permits an absent expiry. Keep that uncertainty visible.
  const uncertain =
    authorization.kind === "indeterminate"
      ? authorization
      : {
          ...authorization,
          kind: "indeterminate" as const,
          reason:
            authorization.voucherNumber === number
              ? ("incomplete_response" as const)
              : ("contradictory_response" as const),
        };
  const attempt = projectEvidence(uncertain, includeRaw);
  return recoverInvoice({
    wsfe,
    auth,
    data,
    attempted,
    attempt,
    includeRaw,
    exact,
    voucher,
  });
}

type RecoveryInput = {
  wsfe: IssueWsfeService;
  auth: Pick<IssueOptions, "representedTaxId" | "forceRefresh">;
  data: WsfeVoucherInput;
  attempted: VoucherCoordinates;
  attempt: Omit<
    Extract<ArcaAuthorizationOutcome<"wsfe">, { kind: "indeterminate" }>,
    "raw"
  > & { raw?: Record<string, unknown> };
  includeRaw: boolean;
  exact: { sent?: WsfeVoucherInput };
  voucher: (cae: string, caeExpiry: string) => IssuedVoucher;
};
async function recoverInvoice({
  wsfe,
  auth,
  data,
  attempted,
  attempt,
  includeRaw,
  exact,
  voucher,
}: RecoveryInput): Promise<IssueOutcome<IssueOptions>> {
  let lookup: Awaited<ReturnType<IssueWsfeService["lookupVoucher"]>>;
  try {
    lookup = await wsfe.lookupVoucher({ ...auth, ...attempted });
  } catch (error) {
    return {
      kind: "indeterminate",
      attempted,
      attempt,
      lookup: { kind: "failed", error: toArcaSafeErrorMetadata(error) },
    };
  }
  const raw = includeRaw ? { raw: lookup.raw } : {};
  if (lookup.kind === "not_found") {
    return {
      kind: "indeterminate",
      attempted,
      attempt,
      lookup: { kind: "not_found", ...raw },
    };
  }
  const matched = matchWsfeVoucherIdentity(
    data,
    attempted.number,
    lookup.voucher
  );
  if (!matched.matches) {
    if (matched.evidence === "conflict") {
      return {
        kind: "conflict",
        attempted,
        attempt,
        found: { ...toVoucherSummary(lookup.voucher), ...raw },
        reason: `${matched.reason}. ${SERIALIZATION_NOTICE}`,
      };
    }
    return {
      kind: "indeterminate",
      attempted,
      attempt,
      lookup: { kind: "incomplete", reason: matched.reason, ...raw },
    };
  }
  // The matcher requires both fields before declaring a complete match.
  return {
    kind: "authorized",
    recoveredByMatch: true,
    voucher: voucher(
      lookup.voucher.cae as string,
      lookup.voucher.caeExpiry as string
    ),
    attempt,
    lookup: { ...toVoucherSummary(lookup.voucher), ...raw },
    ...exact,
  };
}

function projectIssue(issue: ArcaAuthorizationOutcome["errors"][number]) {
  return {
    service: issue.service,
    operation: issue.operation,
    source: issue.source,
    category: issue.category,
    message: issue.message,
    ...(issue.code === undefined ? {} : { code: issue.code }),
    ...(issue.resultLevel === undefined
      ? {}
      : { resultLevel: issue.resultLevel }),
  };
}
function projectEvidence<T extends ArcaAuthorizationOutcome<"wsfe">>(
  evidence: T,
  includeRaw: boolean
): Omit<T, "raw"> & { raw?: Record<string, unknown> } {
  const base = {
    kind: evidence.kind,
    service: evidence.service,
    operation: evidence.operation,
    results: {
      ...(evidence.results.header === undefined
        ? {}
        : { header: evidence.results.header }),
      ...(evidence.results.detail === undefined
        ? {}
        : { detail: evidence.results.detail }),
      ...(evidence.results.operation === undefined
        ? {}
        : { operation: evidence.results.operation }),
    },
    errors: evidence.errors.map(projectIssue),
    observations: evidence.observations.map(projectIssue),
    ...(includeRaw && evidence.raw !== undefined ? { raw: evidence.raw } : {}),
  };
  const projected: Record<string, unknown> = { ...base };
  for (const field of [
    "result",
    "resultLevel",
    "cae",
    "caeExpiry",
    "voucherNumber",
    "reason",
  ] as const) {
    if (field in evidence && evidence[field as keyof T] !== undefined) {
      projected[field] = evidence[field as keyof T];
    }
  }
  if (evidence.kind === "indeterminate" && evidence.authentication) {
    const { code, reason, providerCode } = evidence.authentication;
    projected.authentication = {
      code,
      reason,
      ...(providerCode === undefined ? {} : { providerCode }),
    };
  }
  return projected as Omit<T, "raw"> & { raw?: Record<string, unknown> };
}

function validateOptions(options: IssueOptions) {
  assertIssueObject(options, "options");
  assertIssueKeys(
    options,
    ["representedTaxId", "forceRefresh", "include"],
    "options"
  );
  if (options.representedTaxId !== undefined) {
    issueDocumentNumber(
      options.representedTaxId,
      "options.representedTaxId",
      11,
      11
    );
  }
  if (
    options.forceRefresh !== undefined &&
    typeof options.forceRefresh !== "boolean"
  ) {
    throw new ArcaInputError("options.forceRefresh must be a boolean.", {
      code: "ARCA_INPUT_INVALID_VALUE",
      field: "options.forceRefresh",
    });
  }
  if (options.include !== undefined) {
    assertIssueObject(options.include, "options.include");
    assertIssueKeys(options.include, ["raw", "exactInput"], "options.include");
    for (const field of ["raw", "exactInput"] as const) {
      if (
        options.include[field] !== undefined &&
        typeof options.include[field] !== "boolean"
      ) {
        throw new ArcaInputError(
          `options.include.${field} must be a boolean.`,
          {
            code: "ARCA_INPUT_INVALID_VALUE",
            field: `options.include.${field}`,
          }
        );
      }
    }
  }
}
