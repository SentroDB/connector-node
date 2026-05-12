"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractRequester = extractRequester;
exports.requireApproval = requireApproval;
exports.respondWithPending = respondWithPending;
const approval_context_1 = require("../services/approval-context");
const approval_store_1 = require("../services/approval-store");
/**
 * Extract identity from the verified JWT claims attached to ctx.state.auth by
 * the requireJwtAuth middleware. Returns undefined for unauthenticated routes
 * (validate / health) or during ApprovalContext replays.
 */
function extractRequester(ctx) {
    const replayCtx = approval_context_1.ApprovalContext.requester();
    if (replayCtx)
        return replayCtx;
    const auth = ctx.state.auth;
    if (!auth)
        return undefined;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwcm92YWwtaHR0cC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9pbmMvdXRpbHMvYXBwcm92YWwtaHR0cC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQWtCQSw0Q0FXQztBQU9ELDBDQXNCQztBQUdELGdEQVdDO0FBdkVELG1FQUErRDtBQUMvRCwrREFHb0M7QUFRcEM7Ozs7R0FJRztBQUNILFNBQWdCLGdCQUFnQixDQUFDLEdBQVk7SUFDM0MsTUFBTSxTQUFTLEdBQUcsa0NBQWUsQ0FBQyxTQUFTLEVBQUUsQ0FBQztJQUM5QyxJQUFJLFNBQVM7UUFBRSxPQUFPLFNBQVMsQ0FBQztJQUVoQyxNQUFNLElBQUksR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLElBQThCLENBQUM7SUFDdEQsSUFBSSxDQUFDLElBQUk7UUFBRSxPQUFPLFNBQVMsQ0FBQztJQUM1QixPQUFPO1FBQ0wsTUFBTSxFQUFFLElBQUksQ0FBQyxHQUFHO1FBQ2hCLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztRQUNqQixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7S0FDbEIsQ0FBQztBQUNKLENBQUM7QUFFRDs7OztHQUlHO0FBQ0gsU0FBZ0IsZUFBZSxDQUM3QixHQUFZLEVBQ1osTUFBc0I7SUFFdEIsSUFBSSxrQ0FBZSxDQUFDLFFBQVEsRUFBRTtRQUFFLE9BQU8sU0FBUyxDQUFDO0lBRWpELE1BQU0sU0FBUyxHQUFHLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ3hDLElBQUksQ0FBQyxTQUFTO1FBQUUsT0FBTyxTQUFTLENBQUM7SUFFakMsTUFBTSxNQUFNLEdBQUcsOEJBQWEsQ0FBQyxRQUFRLENBQUMsbUJBQW1CLENBQ3ZELE1BQU0sRUFDTixTQUFTLENBQUMsS0FBSyxDQUNoQixDQUFDO0lBQ0YsSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPO1FBQUUsT0FBTyxTQUFTLENBQUM7SUFFakQsTUFBTSxHQUFHLEdBQUcsOEJBQWEsQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUM5QyxNQUFNLEVBQ04sU0FBUyxFQUNULE1BQU0sQ0FBQyxFQUFFLEVBQ1QsTUFBTSxDQUFDLFFBQVEsQ0FDaEIsQ0FBQztJQUNGLE1BQU0sSUFBSSxzQ0FBcUIsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUN2QyxDQUFDO0FBRUQsNEVBQTRFO0FBQzVFLFNBQWdCLGtCQUFrQixDQUNoQyxHQUFZLEVBQ1osR0FBMEI7SUFFMUIsR0FBRyxDQUFDLE1BQU0sR0FBRyxHQUFHLENBQUM7SUFDakIsT0FBTztRQUNMLE9BQU8sRUFBRSxJQUFJO1FBQ2IsU0FBUyxFQUFFLEdBQUcsQ0FBQyxTQUFTO1FBQ3hCLFFBQVEsRUFBRSxHQUFHLENBQUMsUUFBUTtRQUN0QixNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU07S0FDbkIsQ0FBQztBQUNKLENBQUMifQ==