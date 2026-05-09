import { randomUUID } from "crypto";
import { ApprovalPersistence } from "./approval-persistence";
import type {
  ApprovalAction,
  ApprovalCommentDto,
  ApprovalDecision,
  ApprovalDecisionDto,
  ApprovalPolicy,
  ApprovalRequest,
  ApprovalRequester,
  ApprovalRequestFilter,
  ApprovalStatus,
  CreateApprovalPolicyDto,
  CrudOp,
  UpdateApprovalPolicyDto,
} from "../types/approval";

export class ApprovalRequiredError extends Error {
  public readonly requestId: string;
  public readonly policyId: string;
  public readonly status: ApprovalStatus;
  constructor(req: ApprovalRequest) {
    super(`Approval required (request ${req.id})`);
    this.name = "ApprovalRequiredError";
    this.requestId = req.id;
    this.policyId = req.policyId;
    this.status = req.status;
  }
}

const tableMatches = (pattern: string, table: string): boolean => {
  if (pattern === table) return true;
  if (!pattern.includes("*")) return false;
  const regex = new RegExp(
    "^" +
      pattern
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*") +
      "$"
  );
  return regex.test(table);
};

export class ApprovalStore {
  static #instance: ApprovalStore;
  static get instance() {
    if (!this.#instance) this.#instance = new ApprovalStore();
    return this.#instance;
  }

  private policies = new Map<string, ApprovalPolicy>();
  private requests = new Map<string, ApprovalRequest>();
  private writeLock: Promise<unknown> = Promise.resolve();

  // ─── Lifecycle ───

  load(): void {
    const data = ApprovalPersistence.instance.read();
    this.policies.clear();
    this.requests.clear();
    for (const p of data.policies) this.policies.set(p.id, p);
    for (const r of data.requests) this.requests.set(r.id, r);
    if (data.policies.length || data.requests.length) {
      console.log(
        `[Approvals] Loaded ${data.policies.length} policies, ${data.requests.length} requests`
      );
    }
  }

  private persist(): void {
    try {
      ApprovalPersistence.instance.write({
        policies: this.listPolicies(),
        requests: this.listRequests(),
      });
    } catch (e) {
      console.error("[Approvals] Persist failed", e);
    }
  }

  /** Serialize mutations to avoid concurrent file writes / decision races. */
  private async withLock<T>(fn: () => Promise<T> | T): Promise<T> {
    const next = this.writeLock.then(() => fn());
    this.writeLock = next.catch(() => undefined);
    return next;
  }

  // ─── Policies ───

  listPolicies(): ApprovalPolicy[] {
    return Array.from(this.policies.values());
  }

  getPolicy(id: string): ApprovalPolicy | undefined {
    return this.policies.get(id);
  }

  addPolicy(dto: CreateApprovalPolicyDto): ApprovalPolicy {
    const now = new Date().toISOString();
    const policy: ApprovalPolicy = {
      id: randomUUID(),
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

  updatePolicy(id: string, dto: UpdateApprovalPolicyDto): ApprovalPolicy {
    const existing = this.policies.get(id);
    if (!existing) throw new Error(`Policy ${id} not found`);

    if (dto.name !== undefined) existing.name = dto.name;
    if (dto.enabled !== undefined) existing.enabled = dto.enabled;
    if (dto.match !== undefined) existing.match = dto.match;
    if (dto.approvers !== undefined) {
      existing.approvers = {
        roles: dto.approvers.roles ?? existing.approvers.roles ?? [],
        userIds: dto.approvers.userIds ?? existing.approvers.userIds ?? [],
        minApprovals: Math.max(
          1,
          dto.approvers.minApprovals ?? existing.approvers.minApprovals
        ),
        allowSelfApproval:
          dto.approvers.allowSelfApproval ??
          existing.approvers.allowSelfApproval,
      };
    }
    if (dto.expiryMs !== undefined) existing.expiryMs = dto.expiryMs;
    existing.updatedAt = new Date().toISOString();

    this.policies.set(id, existing);
    this.persist();
    return existing;
  }

  removePolicy(id: string): boolean {
    const deleted = this.policies.delete(id);
    if (deleted) this.persist();
    return deleted;
  }

  // ─── Matcher ───

  findPolicyForAction(
    action: ApprovalAction,
    requesterRoles: string[] | undefined
  ): ApprovalPolicy | null {
    const roles = requesterRoles ?? [];
    for (const policy of this.policies.values()) {
      if (!policy.enabled) continue;
      const m = policy.match;

      if (m.kinds && m.kinds.length && !m.kinds.includes(action.kind)) continue;

      if (action.kind === "CRUD") {
        if (m.tables && m.tables.length) {
          const matched = m.tables.some((p) => tableMatches(p, action.table));
          if (!matched) continue;
        }
        if (m.ops && m.ops.length && !m.ops.includes(action.op as CrudOp)) {
          continue;
        }
      }
      // Non-CRUD actions: tables/ops filters are not meaningful, skip them.

      if (m.requesterRoles && m.requesterRoles.length) {
        const intersects = m.requesterRoles.some((r) => roles.includes(r));
        if (!intersects) continue;
      }

      return policy;
    }
    return null;
  }

  // ─── Requests ───

  listRequests(filter?: ApprovalRequestFilter): ApprovalRequest[] {
    let arr = Array.from(this.requests.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
    if (filter?.status) arr = arr.filter((r) => r.status === filter.status);
    return arr;
  }

  getRequest(id: string): ApprovalRequest | undefined {
    return this.requests.get(id);
  }

  createRequest(
    action: ApprovalAction,
    requester: ApprovalRequester,
    policyId: string,
    expiryMs: number | null
  ): ApprovalRequest {
    const now = new Date();
    const expiresAt = expiryMs
      ? new Date(now.getTime() + expiryMs).toISOString()
      : null;
    const req: ApprovalRequest = {
      id: randomUUID(),
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

  async decide(
    id: string,
    user: { userId: string; userEmail: string; roles?: string[] },
    decision: "APPROVE" | "REJECT",
    dto: ApprovalDecisionDto
  ): Promise<ApprovalRequest> {
    return this.withLock(() => {
      const req = this.requests.get(id);
      if (!req) throw new Error(`Request ${id} not found`);
      if (req.status !== "PENDING") {
        throw new Error(
          `Request ${id} is not pending (current: ${req.status})`
        );
      }

      const policy = this.policies.get(req.policyId);

      if (
        policy &&
        !policy.approvers.allowSelfApproval &&
        user.userId === req.requester.userId
      ) {
        throw new Error("Self-approval not allowed by policy");
      }

      if (policy && !this.userIsAuthorized(user, policy)) {
        throw new Error("User is not an authorized approver for this policy");
      }

      if (req.decisions.some((d) => d.userId === user.userId)) {
        throw new Error("User has already decided on this request");
      }

      const now = new Date().toISOString();
      const entry: ApprovalDecision = {
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
      } else {
        const approvals = req.decisions.filter(
          (d) => d.decision === "APPROVE"
        ).length;
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

  cancel(id: string, user: { userId: string }): ApprovalRequest {
    const req = this.requests.get(id);
    if (!req) throw new Error(`Request ${id} not found`);
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

  addComment(
    id: string,
    user: { userId: string; userEmail?: string },
    dto: ApprovalCommentDto
  ): ApprovalRequest {
    const req = this.requests.get(id);
    if (!req) throw new Error(`Request ${id} not found`);
    const now = new Date().toISOString();
    req.comments.push({
      id: randomUUID(),
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

  markExecuted(id: string): ApprovalRequest {
    const req = this.requests.get(id);
    if (!req) throw new Error(`Request ${id} not found`);
    req.status = "EXECUTED";
    req.executedAt = new Date().toISOString();
    req.updatedAt = req.executedAt;
    this.requests.set(id, req);
    this.persist();
    return req;
  }

  markExecutionFailed(id: string, error: string): ApprovalRequest {
    const req = this.requests.get(id);
    if (!req) throw new Error(`Request ${id} not found`);
    req.status = "EXECUTION_FAILED";
    req.executionError = error;
    req.updatedAt = new Date().toISOString();
    this.requests.set(id, req);
    this.persist();
    return req;
  }

  expireTick(): number {
    let expired = 0;
    const now = Date.now();
    for (const req of this.requests.values()) {
      if (req.status !== "PENDING" || !req.expiresAt) continue;
      if (Date.parse(req.expiresAt) <= now) {
        req.status = "EXPIRED";
        req.updatedAt = new Date().toISOString();
        this.requests.set(req.id, req);
        expired++;
      }
    }
    if (expired) this.persist();
    return expired;
  }

  userIsAuthorized(
    user: { userId: string; roles?: string[] },
    policy: ApprovalPolicy
  ): boolean {
    if (
      policy.approvers.userIds &&
      policy.approvers.userIds.includes(user.userId)
    ) {
      return true;
    }
    if (policy.approvers.roles && policy.approvers.roles.length) {
      const userRoles = user.roles ?? [];
      return policy.approvers.roles.some((r) => userRoles.includes(r));
    }
    return false;
  }
}
