import type { Context } from "koa";
import { ApprovalRequiredError } from "../services/approval-store";
import type { ApprovalAction, ApprovalRequest, ApprovalRequester } from "../types/approval";
export declare const USER_ID_HEADER = "x-user-id";
export declare const USER_EMAIL_HEADER = "x-user-email";
export declare const USER_ROLES_HEADER = "x-user-roles";
/**
 * Extract identity from connector request headers. The admin backend proxy is
 * expected to attach these headers; falls back to anonymous when missing so
 * dev/local-only setups continue to work for non-gated actions.
 */
export declare function extractRequester(ctx: Context): ApprovalRequester | undefined;
/**
 * Apply the approval gate. If the action matches a policy and we're not in a
 * replay, queue an ApprovalRequest and throw ApprovalRequiredError so the
 * caller can short-circuit the response.
 */
export declare function requireApproval(ctx: Context, action: ApprovalAction): ApprovalRequest | undefined;
/** Convert an ApprovalRequiredError into a 202 + pending response shape. */
export declare function respondWithPending(ctx: Context, err: ApprovalRequiredError): {
    pending: true;
    requestId: string;
    policyId: string;
    status: string;
};
//# sourceMappingURL=approval-http.d.ts.map