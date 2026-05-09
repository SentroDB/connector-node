import type { Operation } from "./modelCustomizer";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "CANCELLED" | "EXECUTED" | "EXECUTION_FAILED";
export type ApprovalActionKind = "CRUD" | "ADVANCED_QUERY" | "SCHEMA_CHANGE";
export type CrudOp = Extract<Operation, "CREATE" | "UPDATE" | "DELETE">;
export type ApprovalAction = {
    kind: "CRUD";
    table: string;
    op: CrudOp;
    payload: unknown;
} | {
    kind: "ADVANCED_QUERY";
    sql: string;
    projectDbId: string;
} | {
    kind: "SCHEMA_CHANGE";
    diff: unknown;
};
export interface ApprovalPolicyMatcher {
    kinds?: ApprovalActionKind[];
    tables?: string[];
    ops?: CrudOp[];
    requesterRoles?: string[];
}
export interface ApprovalPolicyApprovers {
    roles?: string[];
    userIds?: string[];
    minApprovals: number;
    allowSelfApproval: boolean;
}
export interface ApprovalPolicy {
    id: string;
    name: string;
    enabled: boolean;
    match: ApprovalPolicyMatcher;
    approvers: ApprovalPolicyApprovers;
    expiryMs: number | null;
    createdAt: string;
    updatedAt: string;
}
export interface ApprovalDecision {
    userId: string;
    userEmail: string;
    decision: "APPROVE" | "REJECT";
    comment: string | null;
    decidedAt: string;
}
export interface ApprovalComment {
    id: string;
    userId: string;
    userEmail?: string;
    body: string;
    createdAt: string;
}
export interface ApprovalRequester {
    userId: string;
    email: string;
    roles?: string[];
}
export interface ApprovalRequest {
    id: string;
    policyId: string;
    status: ApprovalStatus;
    action: ApprovalAction;
    requester: ApprovalRequester;
    decisions: ApprovalDecision[];
    comments: ApprovalComment[];
    createdAt: string;
    updatedAt: string;
    expiresAt: string | null;
    executedAt: string | null;
    executionError: string | null;
}
export interface CreateApprovalPolicyDto {
    name: string;
    enabled?: boolean;
    match: ApprovalPolicyMatcher;
    approvers: ApprovalPolicyApprovers;
    expiryMs?: number | null;
}
export interface UpdateApprovalPolicyDto extends Partial<CreateApprovalPolicyDto> {
}
export interface ApprovalDecisionDto {
    comment?: string | null;
}
export interface ApprovalCommentDto {
    body: string;
}
export interface ApprovalRequestFilter {
    status?: ApprovalStatus;
    mine?: boolean;
    awaitingMyDecision?: boolean;
}
export interface ApprovalReplayCtx {
    __approvalReplay?: true;
    requester?: ApprovalRequester;
}
//# sourceMappingURL=approval.d.ts.map