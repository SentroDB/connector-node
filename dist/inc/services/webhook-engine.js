"use strict";
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var _a, _WebhookEngine_instance;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookEngine = void 0;
const crypto_1 = require("crypto");
const webhook_store_1 = require("./webhook-store");
const webhook_executor_1 = require("./webhook-executor");
const webhook_logger_1 = require("./webhook-logger");
class WebhookEngine {
    constructor() {
        this.retryTimers = new Map();
    }
    static get instance() {
        if (!__classPrivateFieldGet(this, _a, "f", _WebhookEngine_instance))
            __classPrivateFieldSet(this, _a, new _a(), "f", _WebhookEngine_instance);
        return __classPrivateFieldGet(this, _a, "f", _WebhookEngine_instance);
    }
    /**
     * Called after a CRUD operation completes.
     * Finds matching webhooks and fires them concurrently (fire-and-forget).
     */
    async dispatch(event, table, data, meta) {
        const webhooks = webhook_store_1.WebhookStore.instance.findMatchingWebhooks(event, table);
        if (!webhooks.length)
            return;
        await Promise.allSettled(webhooks.map((wh) => this.fireWebhook(wh, event, table, data, meta)));
    }
    async fireWebhook(webhook, event, table, data, meta, attempt = 1) {
        const deliveryId = (0, crypto_1.randomUUID)();
        const now = new Date();
        const payload = {
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
        const result = await webhook_executor_1.WebhookExecutor.deliver(webhook, payload);
        const logEntry = {
            id: deliveryId,
            webhookId: webhook.id,
            timestamp: now,
            requestUrl: webhook.url,
            requestMethod: "POST",
            requestBody: payload,
            requestHeaders: {},
            responseStatus: result.responseStatus ?? 0,
            responseBody: result.responseBody ?? "",
            responseHeaders: result.responseHeaders,
            responseTime: result.responseTime,
            success: result.success,
            error: result.errorMessage ?? undefined,
            triggeredEvent: event,
            triggeredTable: table,
            attemptCount: attempt,
            nextRetryAt: !result.success && attempt < webhook.maxRetries
                ? new Date(Date.now() +
                    webhook.retryBackoff * Math.pow(2, attempt - 1))
                : null,
            lastAttemptAt: now,
        };
        webhook_logger_1.WebhookLogger.instance.record(logEntry);
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
    async resend(logId) {
        const log = webhook_logger_1.WebhookLogger.instance.getById(logId);
        if (!log)
            throw new Error("Log entry not found");
        const webhook = webhook_store_1.WebhookStore.instance.get(log.webhookId);
        if (!webhook)
            throw new Error("Webhook not found");
        await this.fireWebhook(webhook, log.triggeredEvent, log.triggeredTable, log.requestBody?.data ?? log.requestBody, { triggeredBy: "manual_resend" });
    }
    /** Cancel all pending retries (call on shutdown). */
    shutdown() {
        for (const timer of this.retryTimers.values())
            clearTimeout(timer);
        this.retryTimers.clear();
    }
}
exports.WebhookEngine = WebhookEngine;
_a = WebhookEngine;
_WebhookEngine_instance = { value: void 0 };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViaG9vay1lbmdpbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvaW5jL3NlcnZpY2VzL3dlYmhvb2stZW5naW5lLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7OztBQUFBLG1DQUFvQztBQU9wQyxtREFBK0M7QUFDL0MseURBQXFEO0FBQ3JELHFEQUFpRDtBQUVqRCxNQUFhLGFBQWE7SUFBMUI7UUFFVSxnQkFBVyxHQUFHLElBQUksR0FBRyxFQUEwQixDQUFDO0lBa0gxRCxDQUFDO0lBaEhDLE1BQU0sS0FBSyxRQUFRO1FBQ2pCLElBQUksQ0FBQyx1QkFBQSxJQUFJLG1DQUFVO1lBQUUsdUJBQUEsSUFBSSxNQUFhLElBQUksRUFBYSxFQUFFLCtCQUFBLENBQUM7UUFDMUQsT0FBTyx1QkFBQSxJQUFJLG1DQUFVLENBQUM7SUFDeEIsQ0FBQztJQUVEOzs7T0FHRztJQUNILEtBQUssQ0FBQyxRQUFRLENBQ1osS0FBbUIsRUFDbkIsS0FBYSxFQUNiLElBQWEsRUFDYixJQUFtRDtRQUVuRCxNQUFNLFFBQVEsR0FBRyw0QkFBWSxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDMUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNO1lBQUUsT0FBTztRQUU3QixNQUFNLE9BQU8sQ0FBQyxVQUFVLENBQ3RCLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQ3JFLENBQUM7SUFDSixDQUFDO0lBRU8sS0FBSyxDQUFDLFdBQVcsQ0FDdkIsT0FBc0IsRUFDdEIsS0FBbUIsRUFDbkIsS0FBYSxFQUNiLElBQWEsRUFDYixJQUFtRCxFQUNuRCxPQUFPLEdBQUcsQ0FBQztRQUVYLE1BQU0sVUFBVSxH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