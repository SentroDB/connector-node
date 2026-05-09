"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.USER_ROLES_HEADER = exports.USER_EMAIL_HEADER = exports.USER_ID_HEADER = void 0;
exports.extractRequester = extractRequester;
exports.requireApproval = requireApproval;
exports.respondWithPending = respondWithPending;
const approval_context_1 = require("../services/approval-context");
const approval_store_1 = require("../services/approval-store");
exports.USER_ID_HEADER = "x-user-id";
exports.USER_EMAIL_HEADER = "x-user-email";
exports.USER_ROLES_HEADER = "x-user-roles";
/**
 * Extract identity from connector request headers. The admin backend proxy is
 * expected to attach these headers; falls back to anonymous when missing so
 * dev/local-only setups continue to work for non-gated actions.
 */
function extractRequester(ctx) {
    const replayCtx = approval_context_1.ApprovalContext.requester();
    if (replayCtx)
        return replayCtx;
    const headers = ctx.request.headers ?? {};
    const userId = readHeader(headers[exports.USER_ID_HEADER]);
    const email = readHeader(headers[exports.USER_EMAIL_HEADER]);
    if (!userId || !email)
        return undefined;
    const rolesRaw = readHeader(headers[exports.USER_ROLES_HEADER]) ?? "";
    const roles = rolesRaw
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean);
    return { userId, email, roles };
}
function readHeader(value) {
    if (!value)
        return undefined;
    if (Array.isArray(value))
        return value[0];
    return value;
}
/**
 * Apply the approval gate. If the action matches a policy and we're not in a
 * replay, queue an ApprovalRequest and throw ApprovalRequiredError so the
 * caller can short-circuit the response.
 */
function requireApproval(ctx, action) {
    if (approval_context_1.ApprovalContext.isReplay())
        return undefined;
    const requester = extractRequester(ctx);
    if (!requester)
        return undefined;
    const policy = approval_store_1.ApprovalStore.instance.findPolicyForAction(action, requester.roles);
    if (!policy || !policy.enabled)
        return undefined;
    const req = approval_store_1.ApprovalStore.instance.createRequest(action, requester, policy.id, policy.expiryMs);
    throw new approval_store_1.ApprovalRequiredError(req);
}
/** Convert an ApprovalRequiredError into a 202 + pending response shape. */
function respondWithPending(ctx, err) {
    ctx.status = 202;
    return {
        pending: true,
        requestId: err.requestId,
        policyId: err.policyId,
        status: err.status,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwcm92YWwtaHR0cC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9pbmMvdXRpbHMvYXBwcm92YWwtaHR0cC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFxQkEsNENBY0M7QUFhRCwwQ0FzQkM7QUFHRCxnREFXQztBQW5GRCxtRUFBK0Q7QUFDL0QsK0RBR29DO0FBT3ZCLFFBQUEsY0FBYyxHQUFHLFdBQVcsQ0FBQztBQUM3QixRQUFBLGlCQUFpQixHQUFHLGNBQWMsQ0FBQztBQUNuQyxRQUFBLGlCQUFpQixHQUFHLGNBQWMsQ0FBQztBQUVoRDs7OztHQUlHO0FBQ0gsU0FBZ0IsZ0JBQWdCLENBQUMsR0FBWTtJQUMzQyxNQUFNLFNBQVMsR0FBRyxrQ0FBZSxDQUFDLFNBQVMsRUFBRSxDQUFDO0lBQzlDLElBQUksU0FBUztRQUFFLE9BQU8sU0FBUyxDQUFDO0lBRWhDLE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsT0FBTyxJQUFJLEVBQUUsQ0FBQztJQUMxQyxNQUFNLE1BQU0sR0FBRyxVQUFVLENBQUMsT0FBTyxDQUFDLHNCQUFjLENBQUMsQ0FBQyxDQUFDO0lBQ25ELE1BQU0sS0FBSyxHQUFHLFVBQVUsQ0FBQyxPQUFPLENBQUMseUJBQWlCLENBQUMsQ0FBQyxDQUFDO0lBQ3JELElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxLQUFLO1FBQUUsT0FBTyxTQUFTLENBQUM7SUFDeEMsTUFBTSxRQUFRLEdBQUcsVUFBVSxDQUFDLE9BQU8sQ0FBQyx5QkFBaUIsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO0lBQzlELE1BQU0sS0FBSyxHQUFHLFFBQVE7U0FDbkIsS0FBSyxDQUFDLEdBQUcsQ0FBQztTQUNWLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1NBQ3BCLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUNuQixPQUFPLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsQ0FBQztBQUNsQyxDQUFDO0FBRUQsU0FBUyxVQUFVLENBQUMsS0FBb0M7SUFDdEQsSUFBSSxDQUFDLEtBQUs7UUFBRSxPQUFPLFNBQVMsQ0FBQztJQUM3QixJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDO1FBQUUsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDMUMsT0FBTyxLQUFLLENBQUM7QUFDZixDQUFDO0FBRUQ7Ozs7R0FJRztBQUNILFNBQWdCLGVBQWUsQ0FDN0IsR0FBWSxFQUNaLE1BQXNCO0lBRXRCLElBQUksa0NBQWUsQ0FBQyxRQUFRLEVBQUU7UUFBRSxPQUFPLFNBQVMsQ0FBQztJQUVqRCxNQUFNLFNBQVMsR0FBRyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUN4QyxJQUFJLENBQUMsU0FBUztRQUFFLE9BQU8sU0FBUyxDQUFDO0lBRWpDLE1BQU0sTUFBTSxHQUFHLDhCQUFhLENBQUMsUUFBUSxDQUFDLG1CQUFtQixDQUN2RCxNQUFNLEVBQ04sU0FBUyxDQUFDLEtBQUssQ0FDaEIsQ0FBQztJQUNGLElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTztRQUFFLE9BQU8sU0FBUyxDQUFDO0lBRWpELE1BQU0sR0FBRyxHQUFHLDhCQUFhLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FDOUMsTUFBTSxFQUNOLFNBQVMsRUFDVCxNQUFNLENBQUMsRUFBRSxFQUNULE1BQU0sQ0FBQyxRQUFRLENBQ2hCLENBQUM7SUFDRixNQUFNLElBQUksc0NBQXFCLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDdkMsQ0FBQztBQUVELDRFQUE0RTtBQUM1RSxTQUFnQixrQkFBa0IsQ0FDaEMsR0FBWSxFQUNaLEdBQTBCO0lBRTFCLEdBQUcsQ0FBQyxNQUFNLEdBQUcsR0FBRyxDQUFDO0lBQ2pCLE9BQU87UUFDTCxPQUFPLEVBQUUsSUFBSTtRQUNiLFNBQVMsRUFBRSxHQUFHLENBQUMsU0FBUztRQUN4QixRQUFRLEVBQUUsR0FBRyxDQUFDLFFBQVE7UUFDdEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNO0tBQ25CLENBQUM7QUFDSixDQUFDIn0=