import type { ApprovalAction, ApprovalCommentDto, ApprovalDecisionDto, ApprovalPolicy, ApprovalRequest, ApprovalRequester, ApprovalRequestFilter, ApprovalStatus, CreateApprovalPolicyDto, UpdateApprovalPolicyDto } from "../types/approval";
export declare class ApprovalRequiredError extends Error {
    readonly requestId: string;
    readonly policyId: string;
    readonly status: ApprovalStatus;
    constructor(req: ApprovalRequest);
}
export declare class ApprovalStore {
    #private;
    static get instance(): ApprovalStore;
    private policies;
    private requests;
    private writeLock;
    load(): void;
    private persist;
    /** Serialize mutations to avoid concurrent file writes / decision races. */
    private withLock;
    listPolicies(): ApprovalPolicy[];
    getPolicy(id: string): ApprovalPolicy | undefined;
    addPolicy(dto: CreateApprovalPolicyDto): ApprovalPolicy;
    updatePolicy(id: string, dto: UpdateApprovalPolicyDto): ApprovalPolicy;
    removePolicy(id: string): boolean;
    findPolicyForAction(action: ApprovalAction, requesterRoles: string[] | undefined): ApprovalPolicy | null;
    listRequests(filter?: ApprovalRequestFilter): ApprovalRequest[];
    getRequest(id: string): ApprovalRequest | undefined;
    createRequest(action: ApprovalAction, requester: ApprovalRequester, policyId: string, expiryMs: number | null): ApprovalRequest;
    decide(id: string, user: {
        userId: string;
        userEmail: string;
        roles?: string[];
    }, decision: "APPROVE" | "REJECT", dto: ApprovalDecisionDto): Promise<ApprovalRequest>;
    cancel(id: string, user: {
        userId: string;
    }): ApprovalRequest;
    addComment(id: string, user: {
        userId: string;
        userEmail?: string;
    }, dto: ApprovalCommentDto): ApprovalRequest;
    markExecuted(id: string): ApprovalRequest;
    markExecutionFailed(id: string, error: string): ApprovalRequest;
    expireTick(): number;
    userIsAuthorized(user: {
        userId: string;
        roles?: string[];
    }, policy: ApprovalPolicy): boolean;
}
//# sourceMappingURL=approval-store.d.ts.map