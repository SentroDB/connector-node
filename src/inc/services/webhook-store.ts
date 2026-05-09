import { randomUUID } from "crypto";
import { CustomizationStore } from "../core/customizationStore";
import type {
  WebhookConfig,
  WebhookEvent,
  CreateWebhookDto,
  UpdateWebhookDto,
} from "../types/webhook";

export class WebhookStore {
  static #instance: WebhookStore;
  private webhooks = new Map<string, WebhookConfig>();

  static get instance() {
    if (!this.#instance) this.#instance = new WebhookStore();
    return this.#instance;
  }

  // ─── CRUD ───

  add(dto: CreateWebhookDto): WebhookConfig {
    const id = randomUUID();
    const now = new Date();
    const config: WebhookConfig = {
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
        id: randomUUID(),
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

  get(id: string): WebhookConfig | undefined {
    return this.webhooks.get(id);
  }

  getAll(): WebhookConfig[] {
    return Array.from(this.webhooks.values());
  }

  update(id: string, dto: UpdateWebhookDto): WebhookConfig {
    const existing = this.webhooks.get(id);
    if (!existing) throw new Error(`Webhook ${id} not found`);

    if (dto.name !== undefined) existing.name = dto.name;
    if (dto.url !== undefined) existing.url = dto.url;
    if (dto.description !== undefined) existing.description = dto.description;
    if (dto.enabled !== undefined) existing.enabled = dto.enabled;
    if (dto.secret !== undefined) existing.secret = dto.secret;
    if (dto.maxRetries !== undefined) existing.maxRetries = dto.maxRetries;
    if (dto.retryBackoff !== undefined) existing.retryBackoff = dto.retryBackoff;
    if (dto.timeout !== undefined) existing.timeout = dto.timeout;
    if (dto.headers !== undefined) existing.headers = dto.headers;
    if (dto.triggers !== undefined) {
      existing.triggers = dto.triggers.map((t) => ({
        id: randomUUID(),
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

  remove(id: string): boolean {
    const deleted = this.webhooks.delete(id);
    if (deleted) this.persist();
    return deleted;
  }

  // ─── Query ───

  findMatchingWebhooks(event: WebhookEvent, table: string): WebhookConfig[] {
    return Array.from(this.webhooks.values()).filter(
      (wh) =>
        wh.enabled &&
        wh.triggers.some((t) => t.event === event && t.table === table)
    );
  }

  // ─── Persistence (delegates to CustomizationStore) ───

  load(): void {
    const configs = CustomizationStore.instance.getWebhooks();
    this.webhooks.clear();
    for (const c of configs) {
      c.createdAt = new Date(c.createdAt);
      c.updatedAt = new Date(c.updatedAt);
      if (c.logs) {
        c.logs.forEach((l) => {
          l.timestamp = new Date(l.timestamp);
        });
      } else {
        c.logs = [];
      }
      this.webhooks.set(c.id, c);
    }
    if (configs.length) {
      console.log(`[Webhook] Loaded ${configs.length} webhook(s)`);
    }
  }

  private persist(): void {
    try {
      CustomizationStore.instance.setWebhooks(this.getAll());
    } catch (e) {
      console.error("[Webhook] Failed to persist webhooks", e);
    }
  }
}
