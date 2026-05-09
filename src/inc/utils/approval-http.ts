import type { Context } from "koa";
import { ApprovalContext } from "../services/approval-context";
import {
  ApprovalRequiredError,
  ApprovalStore,
} from "../services/approval-store";
import type {
  ApprovalAction,
  ApprovalRequest,
  ApprovalRequester,
} from "../types/approval";

export const USER_ID_HEADER = "x-user-id";
export const USER_EMAIL_HEADER = "x-user-email";
export const USER_ROLES_HEADER = "x-user-roles";

/**
 * Extract identity from connector request headers. The admin backend proxy is
 * expected to attach these headers; falls back to anonymous when missing so
 * dev/local-only setups continue to work for non-gated actions.
 */
export function extractRequester(ctx: Context): ApprovalRequester | undefined {
  const replayCtx = ApprovalContext.requester();
  if (replayCtx) return replayCtx;

  const headers = ctx.request.headers ?? {};
  const userId = readHeader(headers[USER_ID_HEADER]);
  const email = readHeader(headers[USER_EMAIL_HEADER]);
  if (!userId || !email) return undefined;
  const rolesRaw = readHeader(headers[USER_ROLES_HEADER]) ?? "";
  const roles = rolesRaw
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  return { userId, email, roles };
}

function readHeader(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
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
