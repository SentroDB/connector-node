import type { WebhookLogEntry, WebhookLog } from "../types/webhook";
import { WebhookStore } from "./webhook-store";

export class WebhookLogger {
  static #instance: WebhookLogger;
  private logs: WebhookLogEntry[] = [];
  private maxLogsPerWebhook = 100;

  static get instance() {
    if (!this.#instance) this.#instance = new WebhookLogger();
    return this.#instance;
  }

  /** Record a delivery attempt and push a simplified entry into the webhook's logs array. */
  record(entry: WebhookLogEntry): void {
    this.logs.push(entry);

    // Push simplified log into the webhook config so GET /webhooks returns logs inline
    const webhook = WebhookStore.instance.get(entry.webhookId);
    if (webhook) {
      const simplified: WebhookLog = {
        id: entry.id,
        webhookId: entry.webhookId,
        timestamp: entry.timestamp,
        requestBody: entry.requestBody,
        responseStatus: entry.responseStatus,
        responseBody:
          typeof entry.responseBody === "string"
            ? entry.responseBody
            : ((entry.responseBody as Record<string, unknown>) ?? {}),
        success: entry.success,
        error: entry.error,
      };
      webhook.logs.push(simplified);

      // Rolling window per webhook
      if (webhook.logs.length > this.maxLogsPerWebhook) {
        webhook.logs = webhook.logs.slice(-this.maxLogsPerWebhook);
      }
    }

    // Rolling window on internal store
    const webhookLogs = this.logs.filter(
      (l) => l.webhookId === entry.webhookId
    );
    if (webhookLogs.length > this.maxLogsPerWebhook) {
      const idsToKeep = new Set(
        webhookLogs.slice(-this.maxLogsPerWebhook).map((l) => l.id)
      );
      this.logs = this.logs.filter(
        (l) => l.webhookId !== entry.webhookId || idsToKeep.has(l.id)
      );
    }
  }

  getByWebhookId(
    webhookId: string,
    options?: { limit?: number; offset?: number }
  ): { data: WebhookLogEntry[]; total: number } {
    const all = this.logs
      .filter((l) => l.webhookId === webhookId)
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;
    return {
      data: all.slice(offset, offset + limit),
      total: all.length,
    };
  }

  getById(logId: string): WebhookLogEntry | undefined {
    return this.logs.find((l) => l.id === logId);
  }
}
