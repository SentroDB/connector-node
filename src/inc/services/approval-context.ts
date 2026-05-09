import { AsyncLocalStorage } from "async_hooks";
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
export class ApprovalContext {
  private static storage = new AsyncLocalStorage<ApprovalRuntimeCtx>();

  static run<T>(ctx: ApprovalRuntimeCtx, fn: () => T): T {
    return this.storage.run(ctx, fn);
  }

  static current(): ApprovalRuntimeCtx | undefined {
    return this.storage.getStore();
  }

  static requester(): ApprovalRequester | undefined {
    return this.storage.getStore()?.requester;
  }

  static isReplay(): boolean {
    return Boolean(this.storage.getStore()?.isReplay);
  }
}
