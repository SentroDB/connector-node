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
var _a, _WebhookStore_instance;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookStore = void 0;
const crypto_1 = require("crypto");
const customizationStore_1 = require("../core/customizationStore");
class WebhookStore {
    constructor() {
        this.webhooks = new Map();
    }
    static get instance() {
        if (!__classPrivateFieldGet(this, _a, "f", _WebhookStore_instance))
            __classPrivateFieldSet(this, _a, new _a(), "f", _WebhookStore_instance);
        return __classPrivateFieldGet(this, _a, "f", _WebhookStore_instance);
    }
    // ─── CRUD ───
    add(dto) {
        const id = (0, crypto_1.randomUUID)();
        const now = new Date();
        const config = {
            id,
            name: dto.name,
            url: dto.url,
            description: dto.description ?? "",
            enabled: dto.enabled ?? true,
            secret: dto.secret ?? null,
            maxRetries: dto.maxRetries ?? 3,
            retryBackoff: dto.retryBackoff ?? 1000,
            timeout: dto.timeout ?? 10000,
            headers: dto.headers ?? null,
            triggers: dto.triggers.map((t) => ({
                id: (0, crypto_1.randomUUID)(),
                webhookId: id,
                event: t.event,
                table: t.table,
            })),
            logs: [],
            createdAt: now,
            updatedAt: now,
        };
        this.webhooks.set(id, config);
        this.persist();
        return config;
    }
    get(id) {
        return this.webhooks.get(id);
    }
    getAll() {
        return Array.from(this.webhooks.values());
    }
    update(id, dto) {
        const existing = this.webhooks.get(id);
        if (!existing)
            throw new Error(`Webhook ${id} not found`);
        if (dto.name !== undefined)
            existing.name = dto.name;
        if (dto.url !== undefined)
            existing.url = dto.url;
        if (dto.description !== undefined)
            existing.description = dto.description;
        if (dto.enabled !== undefined)
            existing.enabled = dto.enabled;
        if (dto.secret !== undefined)
            existing.secret = dto.secret;
        if (dto.maxRetries !== undefined)
            existing.maxRetries = dto.maxRetries;
        if (dto.retryBackoff !== undefined)
            existing.retryBackoff = dto.retryBackoff;
        if (dto.timeout !== undefined)
            existing.timeout = dto.timeout;
        if (dto.headers !== undefined)
            existing.headers = dto.headers;
        if (dto.triggers !== undefined) {
            existing.triggers = dto.triggers.map((t) => ({
                id: (0, crypto_1.randomUUID)(),
                webhookId: id,
                event: t.event,
                table: t.table,
            }));
        }
        existing.updatedAt = new Date();
        this.webhooks.set(id, existing);
        this.persist();
        return existing;
    }
    remove(id) {
        const deleted = this.webhooks.delete(id);
        if (deleted)
            this.persist();
        return deleted;
    }
    // ─── Query ───
    findMatchingWebhooks(event, table) {
        return Array.from(this.webhooks.values()).filter((wh) => wh.enabled &&
            wh.triggers.some((t) => t.event === event && t.table === table));
    }
    // ─── Persistence (delegates to CustomizationStore) ───
    load() {
        const configs = customizationStore_1.CustomizationStore.instance.getWebhooks();
        this.webhooks.clear();
        for (const c of configs) {
            c.createdAt = new Date(c.createdAt);
            c.updatedAt = new Date(c.updatedAt);
            if (c.logs) {
                c.logs.forEach((l) => {
                    l.timestamp = new Date(l.timestamp);
                });
            }
            else {
                c.logs = [];
            }
            this.webhooks.set(c.id, c);
        }
        if (configs.length) {
            console.log(`[Webhook] Loaded ${configs.length} webhook(s)`);
        }
    }
    persist() {
        try {
            customizationStore_1.CustomizationStore.instance.setWebhooks(this.getAll());
        }
        catch (e) {
            console.error("[Webhook] Failed to persist webhooks", e);
        }
    }
}
exports.WebhookStore = WebhookStore;
_a = WebhookStore;
_WebhookStore_instance = { value: void 0 };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViaG9vay1zdG9yZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9pbmMvc2VydmljZXMvd2ViaG9vay1zdG9yZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7QUFBQSxtQ0FBb0M7QUFDcEMsbUVBQWdFO0FBUWhFLE1BQWEsWUFBWTtJQUF6QjtRQUVVLGFBQVEsR0FBRyxJQUFJLEdBQUcsRUFBeUIsQ0FBQztJQXVIdEQsQ0FBQztJQXJIQyxNQUFNLEtBQUssUUFBUTtRQUNqQixJQUFJLENBQUMsdUJBQUEsSUFBSSxrQ0FBVTtZQUFFLHVCQUFBLElBQUksTUFBYSxJQUFJLEVBQVksRUFBRSw4QkFBQSxDQUFDO1FBQ3pELE9BQU8sdUJBQUEsSUFBSSxrQ0FBVSxDQUFDO0lBQ3hCLENBQUM7SUFFRCxlQUFlO0lBRWYsR0FBRyxDQUFDLEdBQXFCO1FBQ3ZCLE1BQU0sRUFBRSxHQUFHLElBQUEsbUJBQVUsR0FBRSxDQUFDO1FBQ3hCLE1BQU0sR0FBRyxHQUFHLElBQUksSUFBSSxFQUFFLENBQUM7UUFDdkIsTUFBTSxNQUFNLEdBQWtCO1lBQzVCLEVBQUU7WUFDRixJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUk7WUFDZCxHQUFHLEVBQUUsR0FBRyxDQUFDLEdBQUc7WUFDWixXQUFXLEVBQUUsR0FBRyxDQUFDLFdBQVcsSUFBSSxFQUFFO1lBQ2xDLE9BQU8sRUFBRSxHQUFHLENBQUMsT0FBTyxJQUFJLElBQUk7WUFDNUIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLElBQUksSUFBSTtZQUMxQixVQUFVLEVBQUUsR0FBRyxDQUFDLFVBQVUsSUFBSSxDQUFDO1lBQy9CLFlBQVksRUFBRSxHQUFHLENBQUMsWUFBWSxJQUFJLElBQUk7WUFDdEMsT0FBTyxFQUFFLEdBQUcsQ0FBQyxPQUFPLElBQUksS0FBSztZQUM3QixPQUFPLEVBQUUsR0FBRyxDQUFDLE9BQU8sSUFBSSxJQUFJO1lBQzVCLFFBQVEsRUFBRSxH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