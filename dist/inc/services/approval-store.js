"use strict";
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var _a, _ApprovalStore_instance;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApprovalStore = exports.ApprovalRequiredError = void 0;
const crypto_1 = require("crypto");
const approval_persistence_1 = require("./approval-persistence");
class ApprovalRequiredError extends Error {
    constructor(req) {
        super(`Approval required (request ${req.id})`);
        this.name = "ApprovalRequiredError";
        this.requestId = req.id;
        this.policyId = req.policyId;
        this.status = req.status;
    }
}
exports.ApprovalRequiredError = ApprovalRequiredError;
const tableMatches = (pattern, table) => {
    if (pattern === table)
        return true;
    if (!pattern.includes("*"))
        return false;
    const regex = new RegExp("^" +
        pattern
            .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
            .replace(/\*/g, ".*") +
        "$");
    return regex.test(table);
};
class ApprovalStore {
    constructor() {
        this.policies = new Map();
        this.requests = new Map();
        this.writeLock = Promise.resolve();
    }
    static get instance() {
        if (!__classPrivateFieldGet(this, _a, "f", _ApprovalStore_instance))
            __classPrivateFieldSet(this, _a, new _a(), "f", _ApprovalStore_instance);
        return __classPrivateFieldGet(this, _a, "f", _ApprovalStore_instance);
    }
    // ─── Lifecycle ───
    load() {
        const data = approval_persistence_1.ApprovalPersistence.instance.read();
        this.policies.clear();
        this.requests.clear();
        for (const p of data.policies)
            this.policies.set(p.id, p);
        for (const r of data.requests)
            this.requests.set(r.id, r);
        if (data.policies.length || data.requests.length) {
            console.log(`[Approvals] Loaded ${data.policies.length} policies, ${data.requests.length} requests`);
        }
    }
    persist() {
        try {
            approval_persistence_1.ApprovalPersistence.instance.write({
                policies: this.listPolicies(),
                requests: this.listRequests(),
            });
        }
        catch (e) {
            console.error("[Approvals] Persist failed", e);
        }
    }
    /** Serialize mutations to avoid concurrent file writes / decision races. */
    async withLock(fn) {
        const next = this.writeLock.then(() => fn());
        this.writeLock = next.catch(() => undefined);
        return next;
    }
    // ─── Policies ───
    listPolicies() {
        return Array.from(this.policies.values());
    }
    getPolicy(id) {
        return this.policies.get(id);
    }
    addPolicy(dto) {
        const now = new Date().toISOString();
        const policy = {
            id: (0, crypto_1.randomUUID)(),
            name: dto.name,
            enabled: dto.enabled ?? true,
            match: dto.match ?? {},
            approvers: {
                roles: dto.approvers.roles ?? [],
                userIds: dto.approvers.userIds ?? [],
                minApprovals: Math.max(1, dto.approvers.minApprovals ?? 1),
                allowSelfApproval: dto.approvers.allowSelfApproval ?? false,
            },
            expiryMs: dto.expiryMs ?? null,
            createdAt: now,
            updatedAt: now,
        };
        this.policies.set(policy.id, policy);
        this.persist();
        return policy;
    }
    updatePolicy(id, dto) {
        const existing = this.policies.get(id);
        if (!existing)
            throw new Error(`Policy ${id} not found`);
        if (dto.name !== undefined)
            existing.name = dto.name;
        if (dto.enabled !== undefined)
            existing.enabled = dto.enabled;
        if (dto.match !== undefined)
            existing.match = dto.match;
        if (dto.approvers !== undefined) {
            existing.approvers = {
                roles: dto.approvers.roles ?? existing.approvers.roles ?? [],
                userIds: dto.approvers.userIds ?? existing.approvers.userIds ?? [],
                minApprovals: Math.max(1, dto.approvers.minApprovals ?? existing.approvers.minApprovals),
                allowSelfApproval: dto.approvers.allowSelfApproval ??
                    existing.approvers.allowSelfApproval,
            };
        }
        if (dto.expiryMs !== undefined)
            existing.expiryMs = dto.expiryMs;
        existing.updatedAt = new Date().toISOString();
        this.policies.set(id, existing);
        this.persist();
        return existing;
    }
    removePolicy(id) {
        const deleted = this.policies.delete(id);
        if (deleted)
            this.persist();
        return deleted;
    }
    // ─── Matcher ───
    findPolicyForAction(action, requesterRoles) {
        const roles = requesterRoles ?? [];
        for (const policy of this.policies.values()) {
            if (!policy.enabled)
                continue;
            const m = policy.match;
            if (m.kinds && m.kinds.length && !m.kinds.includes(action.kind))
                continue;
            if (action.kind === "CRUD") {
                if (m.tables && m.tables.length) {
                    const matched = m.tables.some((p) => tableMatches(p, action.table));
                    if (!matched)
                        continue;
                }
                if (m.ops && m.ops.length && !m.ops.includes(action.op)) {
                    continue;
                }
            }
            // Non-CRUD actions: tables/ops filters are not meaningful, skip them.
            if (m.requesterRoles && m.requesterRoles.length) {
                const intersects = m.requesterRoles.some((r) => roles.includes(r));
                if (!intersects)
                    continue;
            }
            return policy;
        }
        return null;
    }
    // ─── Requests ───
    listRequests(filter) {
        let arr = Array.from(this.requests.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        if (filter?.status)
            arr = arr.filter((r) => r.status === filter.status);
        return arr;
    }
    getRequest(id) {
        return this.requests.get(id);
    }
    createRequest(action, requester, policyId, expiryMs) {
        const now = new Date();
        const expiresAt = expiryMs
            ? new Date(now.getTime() + expiryMs).toISOString()
            : null;
        const req = {
            id: (0, crypto_1.randomUUID)(),
            policyId,
            status: "PENDING",
            action,
            requester,
            decisions: [],
            comments: [],
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
            expiresAt,
            executedAt: null,
            executionError: null,
        };
        this.requests.set(req.id, req);
        this.persist();
        return req;
    }
    async decide(id, user, decision, dto) {
        return this.withLock(() => {
            const req = this.requests.get(id);
            if (!req)
                throw new Error(`Request ${id} not found`);
            if (req.status !== "PENDING") {
                throw new Error(`Request ${id} is not pending (current: ${req.status})`);
            }
            const policy = this.policies.get(req.policyId);
            if (policy &&
                !policy.approvers.allowSelfApproval &&
                user.userId === req.requester.userId) {
                throw new Error("Self-approval not allowed by policy");
            }
            if (policy && !this.userIsAuthorized(user, policy)) {
                throw new Error("User is not an authorized approver for this policy");
            }
            if (req.decisions.some((d) => d.userId === user.userId)) {
                throw new Error("User has already decided on this request");
            }
            const now = new Date().toISOString();
            const entry = {
                userId: user.userId,
                userEmail: user.userEmail,
                decision,
                comment: dto.comment ?? null,
                decidedAt: now,
            };
            req.decisions.push(entry);
            req.updatedAt = now;
            if (decision === "REJECT") {
                req.status = "REJECTED";
            }
            else {
                const approvals = req.decisions.filter((d) => d.decision === "APPROVE").length;
                const minApprovals = policy?.approvers.minApprovals ?? 1;
                if (approvals >= minApprovals) {
                    req.status = "APPROVED";
                }
            }
            this.requests.set(id, req);
            this.persist();
            return req;
        });
    }
    cancel(id, user) {
        const req = this.requests.get(id);
        if (!req)
            throw new Error(`Request ${id} not found`);
        if (req.requester.userId !== user.userId) {
            throw new Error("Only the requester can cancel a request");
        }
        if (req.status !== "PENDING") {
            throw new Error(`Cannot cancel request in state ${req.status}`);
        }
        req.status = "CANCELLED";
        req.updatedAt = new Date().toISOString();
        this.requests.set(id, req);
        this.persist();
        return req;
    }
    addComment(id, user, dto) {
        const req = this.requests.get(id);
        if (!req)
            throw new Error(`Request ${id} not found`);
        const now = new Date().toISOString();
        req.comments.push({
            id: (0, crypto_1.randomUUID)(),
            userId: user.userId,
            userEmail: user.userEmail,
            body: dto.body,
            createdAt: now,
        });
        req.updatedAt = now;
        this.requests.set(id, req);
        this.persist();
        return req;
    }
    markExecuted(id) {
        const req = this.requests.get(id);
        if (!req)
            throw new Error(`Request ${id} not found`);
        req.status = "EXECUTED";
        req.executedAt = new Date().toISOString();
        req.updatedAt = req.executedAt;
        this.requests.set(id, req);
        this.persist();
        return req;
    }
    markExecutionFailed(id, error) {
        const req = this.requests.get(id);
        if (!req)
            throw new Error(`Request ${id} not found`);
        req.status = "EXECUTION_FAILED";
        req.executionError = error;
        req.updatedAt = new Date().toISOString();
        this.requests.set(id, req);
        this.persist();
        return req;
    }
    expireTick() {
        let expired = 0;
        const now = Date.now();
        for (const req of this.requests.values()) {
            if (req.status !== "PENDING" || !req.expiresAt)
                continue;
            if (Date.parse(req.expiresAt) <= now) {
                req.status = "EXPIRED";
                req.updatedAt = new Date().toISOString();
                this.requests.set(req.id, req);
                expired++;
            }
        }
        if (expired)
            this.persist();
        return expired;
    }
    userIsAuthorized(user, policy) {
        if (policy.approvers.userIds &&
            policy.approvers.userIds.includes(user.userId)) {
            return true;
        }
        if (policy.approvers.roles && policy.approvers.roles.length) {
            const userRoles = user.roles ?? [];
            return policy.approvers.roles.some((r) => userRoles.includes(r));
        }
        return false;
    }
}
exports.ApprovalStore = ApprovalStore;
_a = ApprovalStore;
_ApprovalStore_instance = { value: void 0 };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwcm92YWwtc3RvcmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvaW5jL3NlcnZpY2VzL2FwcHJvdmFsLXN0b3JlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7OztBQUFBLG1DQUFvQztBQUNwQyxpRUFBNkQ7QUFnQjdELE1BQWEscUJBQXNCLFNBQVEsS0FBSztJQUk5QyxZQUFZLEdBQW9CO1FBQzlCLEtBQUssQ0FBQyw4QkFBOEIsR0FBRyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDL0MsSUFBSSxDQUFDLElBQUksR0FBRyx1QkFBdUIsQ0FBQztRQUNwQyxJQUFJLENBQUMsU0FBUyxHQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDeEIsSUFBSSxDQUFDLFFBQVEsR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDO1FBQzdCLElBQUksQ0FBQyxNQUFNLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQztJQUMzQixDQUFDO0NBQ0Y7QUFYRCxzREFXQztBQUVELE1BQU0sWUFBWSxHQUFHLENBQUMsT0FBZSxFQUFFLEtBQWEsRUFBVyxFQUFFO0lBQy9ELElBQUksT0FBTyxLQUFLLEtBQUs7UUFBRSxPQUFPLElBQUksQ0FBQztJQUNuQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUM7UUFBRSxPQUFPLEtBQUssQ0FBQztJQUN6QyxNQUFNLEtBQUssR0FBRyxJQUFJLE1BQU0sQ0FDdEIsR0FBRztRQUNELE9BQU87YUFDSixPQUFPLENBQUMsb0JBQW9CLEVBQUUsTUFBTSxDQUFDO2FBQ3JDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDO1FBQ3ZCLEdBQUcsQ0FDTixDQUFDO0lBQ0YsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQzNCLENBQUMsQ0FBQztBQUVGLE1BQWEsYUFBYTtJQUExQjtRQU9VLGFBQVEsR0FBRyxJQUFJLEdBQUcsRUFBMEIs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