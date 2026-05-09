import type { WebhookLogEntry } from "../types/webhook";
export declare class WebhookLogger {
    #private;
    private logs;
    private maxLogsPerWebhook;
    static get instance(): WebhookLogger;
    /** Record a delivery attempt and push a simplified entry into the webhook's logs array. */
    record(entry: WebhookLogEntry): void;
    getByWebhookId(webhookId: string, options?: {
        limit?: number;
        offset?: number;
    }): {
        data: WebhookLogEntry[];
        total: number;
    };
    getById(logId: string): WebhookLogEntry | undefined;
}
//# sourceMappingURL=webhook-logger.d.ts.map