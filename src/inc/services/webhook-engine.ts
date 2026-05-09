import { randomUUID } from "crypto";
import type {
  WebhookConfig,
  WebhookEvent,
  WebhookPayload,
  WebhookLogEntry,
} from "../types/webhook";
import { WebhookStore } from "./webhook-store";
import { WebhookExecutor } from "./webhook-executor";
import { WebhookLogger } from "./webhook-logger";

export class WebhookEngine {
  static #instance: WebhookEngine;
  private retryTimers = new Map<string, NodeJS.Timeout>();

  static get instance() {
    if (!this.#instance) this.#instance = new WebhookEngine();
    return this.#instance;
  }

  /**
   * Called after a CRUD operation completes.
   * Finds matching webhooks and fires them concurrently (fire-and-forget).
   */
  async dispatch(
    event: WebhookEvent,
    table: string,
    data: unknown,
    meta?: { triggeredBy?: string; projectId?: string }
  ): Promise<void> {
    const webhooks = WebhookStore.instance.findMatchingWebhooks(event, table);
    if (!webhooks.length) return;

    await Promise.allSettled(
      webhooks.map((wh) => this.fireWebhook(wh, event, table, data, meta))
    );
  }

  private async fireWebhook(
    webhook: WebhookConfig,
    event: WebhookEvent,
    table: string,
    data: unknown,
    meta?: { triggeredBy?: string; projectId?: string },
    attempt = 1
  ): Promise<void> {
    const deliveryId = randomUUID();
    const now = new Date();
    const payload: WebhookPayload = {
      id: deliveryId,
      timestamp: now.toISOString(),
      event,
      table,
      data,
      metadata: {
        webhookId: webhook.id,
        webhookName: webhook.name,
        attempt,
        projectId: meta?.projectId,
      },
    };

    const result = await WebhookExecutor.deliver(webhook, payload);

    const logEntry: WebhookLogEntry = {
      id: deliveryId,
      webhookId: webhook.id,
      timestamp: now,
      requestUrl: webhook.url,
      requestMethod: "POST",
      requestBody: payload as unknown as Record<string, unknown>,
      requestHeaders: {},
      responseStatus: result.responseStatus ?? 0,
      responseBody:
        (result.responseBody as Record<string, unknown> | string) ?? "",
      responseHeaders: result.responseHeaders,
      responseTime: result.responseTime,
      success: result.success,
      error: result.errorMessage ?? undefined,
      triggeredEvent: event,
      triggeredTable: table,
      attemptCount: attempt,
      nextRetryAt:
        !result.success && attempt < webhook.maxRetries
          ? new Date(
              Date.now() +
                webhook.retryBackoff * Math.pow(2, attempt - 1)
            )
          : null,
      lastAttemptAt: now,
    };

    WebhookLogger.instance.record(logEntry);

    // Schedule retry if needed
    if (!result.success && attempt < webhook.maxRetries) {
      const delay = webhook.retryBackoff * Math.pow(2, attempt - 1);
      const timer = setTimeout(() => {
        this.fireWebhook(webhook, event, table, data, meta, attempt + 1);
        this.retryTimers.delete(deliveryId);
      }, delay);
      this.retryTimers.set(deliveryId, timer);
    }
  }

  /** Resend a specific failed log entry. */
  async resend(logId: string): Promise<void> {
    const log = WebhookLogger.instance.getById(logId);
    if (!log) throw new Error("Log entry not found");

    const webhook = WebhookStore.instance.get(log.webhookId);
    if (!webhook) throw new Error("Webhook not found");

    await this.fireWebhook(
      webhook,
      log.triggeredEvent,
      log.triggeredTable,
      (log.requestBody as any)?.data ?? log.requestBody,
      { triggeredBy: "manual_resend" }
    );
  }

  /** Cancel all pending retries (call on shutdown). */
  shutdown(): void {
    for (const timer of this.retryTimers.values()) clearTimeout(timer);
    this.retryTimers.clear();
  }
}
