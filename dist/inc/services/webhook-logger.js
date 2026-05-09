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
var _a, _WebhookLogger_instance;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookLogger = void 0;
const webhook_store_1 = require("./webhook-store");
class WebhookLogger {
    constructor() {
        this.logs = [];
        this.maxLogsPerWebhook = 100;
    }
    static get instance() {
        if (!__classPrivateFieldGet(this, _a, "f", _WebhookLogger_instance))
            __classPrivateFieldSet(this, _a, new _a(), "f", _WebhookLogger_instance);
        return __classPrivateFieldGet(this, _a, "f", _WebhookLogger_instance);
    }
    /** Record a delivery attempt and push a simplified entry into the webhook's logs array. */
    record(entry) {
        this.logs.push(entry);
        // Push simplified log into the webhook config so GET /webhooks returns logs inline
        const webhook = webhook_store_1.WebhookStore.instance.get(entry.webhookId);
        if (webhook) {
            const simplified = {
                id: entry.id,
                webhookId: entry.webhookId,
                timestamp: entry.timestamp,
                requestBody: entry.requestBody,
                responseStatus: entry.responseStatus,
                responseBody: typeof entry.responseBody === "string"
                    ? entry.responseBody
                    : (entry.responseBody ?? {}),
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
        const webhookLogs = this.logs.filter((l) => l.webhookId === entry.webhookId);
        if (webhookLogs.length > this.maxLogsPerWebhook) {
            const idsToKeep = new Set(webhookLogs.slice(-this.maxLogsPerWebhook).map((l) => l.id));
            this.logs = this.logs.filter((l) => l.webhookId !== entry.webhookId || idsToKeep.has(l.id));
        }
    }
    getByWebhookId(webhookId, options) {
        const all = this.logs
            .filter((l) => l.webhookId === webhookId)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const limit = options?.limit ?? 20;
        const offset = options?.offset ?? 0;
        return {
            data: all.slice(offset, offset + limit),
            total: all.length,
        };
    }
    getById(logId) {
        return this.logs.find((l) => l.id === logId);
    }
}
exports.WebhookLogger = WebhookLogger;
_a = WebhookLogger;
_WebhookLogger_instance = { value: void 0 };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViaG9vay1sb2dnZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvaW5jL3NlcnZpY2VzL3dlYmhvb2stbG9nZ2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7OztBQUNBLG1EQUErQztBQUUvQyxNQUFhLGFBQWE7SUFBMUI7UUFFVSxTQUFJLEdBQXNCLEVBQUUsQ0FBQztRQUM3QixzQkFBaUIsR0FBRyxHQUFHLENBQUM7SUF1RWxDLENBQUM7SUFyRUMsTUFBTSxLQUFLLFFBQVE7UUFDakIsSUFBSSxDQUFDLHVCQUFBLElBQUksbUNBQVU7WUFBRSx1QkFBQSxJQUFJLE1BQWEsSUFBSSxFQUFhLEVBQUUsK0JBQUEsQ0FBQztRQUMxRCxPQUFPLHVCQUFBLElBQUksbUNBQVUsQ0FBQztJQUN4QixDQUFDO0lBRUQsMkZBQTJGO0lBQzNGLE1BQU0sQ0FBQyxLQUFzQjtRQUMzQixJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUV0QixtRkFBbUY7UUFDbkYsTUFBTSxPQUFPLEdBQUcsNEJBQVksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUMzRCxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQ1osTUFBTSxVQUFVLEdBQWU7Z0JBQzdCLEVBQUUsRUFBRSxLQUFLLENBQUMsRUFBRTtnQkFDWixTQUFTLEVBQUUsS0FBSyxDQUFDLFNBQVM7Z0JBQzFCLFNBQVMsRUFBRSxLQUFLLENBQUMsU0FBUztnQkFDMUIsV0FBVyxFQUFFLEtBQUssQ0FBQyxXQUFXO2dCQUM5QixjQUFjLEVBQUUsS0FBSyxDQUFDLGNBQWM7Z0JBQ3BDLFlBQVksRUFDVixPQUFPLEtBQUssQ0FBQyxZQUFZLEtBQUssUUFBUTtvQkFDcEMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxZQUFZO29CQUNwQixDQUFDLENBQUMsQ0FBRSxLQUFLLENBQUMsWUFBd0MsSUFBSSxFQUFFLENBQUM7Z0JBQzdELE9BQU8sRUFBRSxLQUFLLENBQUMsT0FBTztnQkFDdEIsS0FBSyxFQUFFLEtBQUssQ0FBQyxLQUFLO2FBQ25CLENBQUM7WUFDRixPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUU5Qiw2QkFBNkI7WUFDN0IsSUFBSSxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztnQkFDakQsT0FBTyxDQUFDLElBQUksR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1lBQzdELENBQUM7UUFDSCxDQUFDO1FBRUQsbUNBQW1DO1FBQ25DLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUNsQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsS0FBSyxLQUFLLENBQUMsU0FBUyxDQUN2QyxDQUFDO1FBQ0YsSUFBSSxXQUFXLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQ2hELE1BQU0sU0FBUyxHQUFHLElBQUksR0FBRyxDQUN2QixXQUFXLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQzVELENBQUM7WUFDRixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUMxQixDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsS0FBSyxLQUFLLENBQUMsU0FBUyxJQUFJLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUM5RCxDQUFDO1FBQ0osQ0FBQztJQUNILENBQUM7SUFFRCxjQUFjLENBQ1osU0FBaUIsRUFDakIsT0FBNkM7UUFFN0MsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLElBQUk7YUFDbEIsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxLQUFLLFNBQVMsQ0FBQzthQUN4QyxJQUFJLENBQ0gsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FDUCxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsT0FBTyxFQUFFLEdBQUcsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUNwRSxDQUFDO1FBRUosTUFBTSxLQUFLLEdBQUcsT0FBTyxFQUFFLEtBQUssSUFBSSxFQUFFLENBQUM7UUFDbkMsTUFBTSxNQUFNLEdBQUcsT0FBTyxFQUFFLE1BQU0sSUFBSSxDQUFDLENBQUM7UUFDcEMsT0FBTztZQUNMLElBQUksRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxNQUFNLEdBQUcsS0FBSyxDQUFDO1lBQ3ZDLEtBQUssRUFBRSxHQUFHLENBQUMsTUFBTTtTQUNsQixDQUFDO0lBQ0osQ0FBQztJQUVELE9BQU8sQ0FBQyxLQUFhO1FBQ25CLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssS0FBSyxDQUFDLENBQUM7SUFDL0MsQ0FBQztDQUNGO0FBMUVELHNDQTBFQzs7QUF6RVEsMkNBQVMsQ0FBZ0IifQ==