import type { WebhookEvent } from "../types/webhook";
export declare class WebhookEngine {
    #private;
    private retryTimers;
    static get instance(): WebhookEngine;
    /**
     * Called after a CRUD operation completes.
     * Finds matching webhooks and fires them concurrently (fire-and-forget).
     */
    dispatch(event: WebhookEvent, table: string, data: unknown, meta?: {
        triggeredBy?: string;
        projectId?: string;
    }): Promise<void>;
    private fireWebhook;
    /** Resend a specific failed log entry. */
    resend(logId: string): Promise<void>;
    /** Cancel all pending retries (call on shutdown). */
    shutdown(): void;
}
//# sourceMappingURL=webhook-engine.d.ts.map