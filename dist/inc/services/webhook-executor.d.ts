import type { WebhookConfig, WebhookPayload, DeliveryResult } from "../types/webhook";
export declare class WebhookExecutor {
    static deliver(webhook: WebhookConfig, payload: WebhookPayload): Promise<DeliveryResult>;
    static sign(body: string, secret: string): string;
}
//# sourceMappingURL=webhook-executor.d.ts.map