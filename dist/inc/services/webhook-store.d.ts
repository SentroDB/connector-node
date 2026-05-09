import type { WebhookConfig, WebhookEvent, CreateWebhookDto, UpdateWebhookDto } from "../types/webhook";
export declare class WebhookStore {
    #private;
    private webhooks;
    static get instance(): WebhookStore;
    add(dto: CreateWebhookDto): WebhookConfig;
    get(id: string): WebhookConfig | undefined;
    getAll(): WebhookConfig[];
    update(id: string, dto: UpdateWebhookDto): WebhookConfig;
    remove(id: string): boolean;
    findMatchingWebhooks(event: WebhookEvent, table: string): WebhookConfig[];
    load(): void;
    private persist;
}
//# sourceMappingURL=webhook-store.d.ts.map