import type { Context } from "koa";
import { ApprovalContext } from "../services/approval-context";
import {
  ApprovalRequiredError,
  ApprovalStore,
} from "../services/approval-store";
import type { AuthClaims } from "../router/requireJwtAuth";
import type {
  ApprovalAction,
  ApprovalRequest,
  ApprovalRequester,
} from "../types/approval";

/**
 * Extract identity from the verified JWT claims attached to ctx.state.auth by
 * the requireJwtAuth middleware. Returns undefined for unauthenticated routes
 * (validate / health) or during ApprovalContext replays.
 */
export function extractRequester(ctx: Context): ApprovalRequester | undefined {
  const replayCtx = ApprovalContext.requester();
  if (replayCtx) return replayCtx;

  const auth = ctx.state.auth as AuthClaims | undefined;
  if (!auth) return undefined;
  return {
    userId: auth.sub,
    email: auth.email,
    roles: auth.roles,
  };
}

/**
 * Apply the approval gate. If the action matches a policy and we're not in a
 * replay, queue an ApprovalRequest and throw ApprovalRequiredError so the
 * caller can short-circuit the response.
 */
export function requireApproval(
  ctx: Context,
  action: ApprovalAction
): ApprovalRequest | undefined {
  if (ApprovalContext.isReplay()) return undefined;

  const requester = extractRequester(ctx);
  if (!requester) return undefined;

  const policy = ApprovalStore.instance.findPolicyForAction(
    action,
    requester.roles
  );
  if (!policy || !policy.enabled) return undefined;

  const req = ApprovalStore.instance.createRequest(
    action,
    requester,
    policy.id,
    policy.expiryMs
  );
  throw new ApprovalRequiredError(req);
}

/** Convert an ApprovalRequiredError into a 202 + pending response shape. */
export function respondWithPending(
  ctx: Context,
  err: ApprovalRequiredError
): { pending: true; requestId: string; policyId: string; status: string } {
  ctx.status = 202;
  return {
    pending: true,
    requestId: err.requestId,
    policyId: err.policyId,
    status: err.status,
  };
}
