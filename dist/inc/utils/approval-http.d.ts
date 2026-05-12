import type { Context } from "koa";
import { ApprovalRequiredError } from "../services/approval-store";
import type { ApprovalAction, ApprovalRequest, ApprovalRequester } from "../types/approval";
/**
 * Extract identity from the verified JWT claims attached to ctx.state.auth by
 * the requireJwtAuth middleware. Returns undefined for unauthenticated routes
 * (validate / health) or during ApprovalContext replays.
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