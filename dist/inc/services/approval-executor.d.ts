import type { ApprovalRequest } from "../types/approval";
/**
 * Replays an APPROVED request using the original requester identity.
 * Bypasses the approval gate via ApprovalContext.isReplay.
 */
export declare class ApprovalExecutor {
    #private;
    static get instance(): ApprovalExecutor;
    execute(requestId: string): Promise<ApprovalRequest>;
    private runAction;
    private runCrud;
    private runAdvancedQuery;
}
//# sourceMappingURL=approval-executor.d.ts.map