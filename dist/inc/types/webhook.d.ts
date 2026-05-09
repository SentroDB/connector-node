import type { Operation } from "./modelCustomizer";
/** Alias for clarity — same values as Operation: "CREATE" | "READ" | "UPDATE" | "DELETE" */
export type WebhookEvent = Operation;
export interface WebhookTrigger {
    id: string;
    webhookId: string;
    event: WebhookEvent;
    table: string;
}
export interface WebhookLog {
    id: string;
    webhookId: string;
    timestamp: Date;
    requestBody: Record<string, unknown>;
    responseStatus: number;
    responseBody: Record<string, unknown> | string;
    success: boolean;
    error?: string;
}
export interface WebhookConfig {
    id: string;
    name: string;
    url: string;
    description: string;
    enabled: boolean;
    secret: string | null;
    maxRetries: number;
    retryBackoff: number;
    timeout: number;
    headers: Record<string, string> | null;
    triggers: WebhookTrigger[];
    logs: WebhookLog[];
    createdAt: Date;
    updatedAt: Date;
}
export interface WebhookLogEntry extends WebhookLog {
    requestUrl: string;
    requestMethod: string;
    requestHeaders: Record<string, string>;
    responseHeaders: Record<string, string> | null;
    responseTime: number | null;
    triggeredEvent: WebhookEvent;
    triggeredTable: string;
    attemptCount: number;
    nextRetryAt: Date | null;
    lastAttemptAt: Date;
}
export interface CreateWebhookDto {
    name: string;
    url: string;
    description?: string;
    enabled?: boolean;
    secret?: string;
    maxRetries?: number;
    retryBackoff?: number;
    timeout?: number;
    headers?: Record<string, string>;
    triggers: {
        event: WebhookEvent;
        table: string;
    }[];
}
export interface UpdateWebhookDto extends Partial<CreateWebhookDto> {
}
export interface WebhookPayload {
    id: string;
    timestamp: string;
    event: WebhookEvent;
    table: string;
    data: unknown;
    metadata: {
        webhookId: string;
        webhookName: string;
        attempt: number;
        projectId?: string;
    };
}
export interface DeliveryResult {
    success: boolean;
    responseStatus: number | null;
    responseBody: unknown;
    responseHeaders: Record<string, string> | null;
    responseTime: number;
    errorMessage: string | null;
}
//# sourceMappingURL=webhook.d.ts.map