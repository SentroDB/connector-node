import type { ApprovalRequester } from "../types/approval";
export interface ApprovalRuntimeCtx {
    requester?: ApprovalRequester;
    isReplay?: boolean;
}
/**
 * Async-local context for approval-aware request handling.
 * Routes wrap their handlers with `run` so deeper code (HookEngine, executors)
 * can read the current requester / replay flag without threading params.
 */
export declare class ApprovalContext {
    private static storage;
    static run<T>(ctx: ApprovalRuntimeCtx, fn: () => T): T;
    static current(): ApprovalRuntimeCtx | undefined;
    static requester(): ApprovalRequester | undefined;
    static isReplay(): boolean;
}
//# sourceMappingURL=approval-context.d.ts.map