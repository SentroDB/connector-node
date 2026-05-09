# Webhook System Implementation Guide for `connector-node`

This document describes how to implement a webhook notification system inside the `connector-node` package. The goal is to fire HTTP callbacks to user-configured URLs whenever CRUD operations occur on database tables, matching the frontend UI already built in `frontend/src/lib/components/pages/app/organizations/project/settings/webhooks/`.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Frontend Compatibility Reference](#frontend-compatibility-reference)
4. [Data Structures & Types](#data-structures--types)
5. [Core Components](#core-components)
   - [WebhookStore](#1-webhookstore)
   - [WebhookExecutor](#2-webhookexecutor)
   - [WebhookLogger](#3-webhooklogger)
   - [WebhookEngine](#4-webhookengine)
6. [Integration with Existing Code](#integration-with-existing-code)
7. [API Routes](#api-routes)
8. [Request Signing](#request-signing)
9. [Retry Strategy](#retry-strategy)
10. [Payload Format](#payload-format)
11. [File Structure](#file-structure)
12. [Step-by-Step Implementation](#step-by-step-implementation)

---

## Overview

The webhook system listens for CRUD operations that flow through `DynamicModelRoute` handlers (`getData`, `insert`, `update`, `delete`) and, when a matching trigger is found, sends an HTTP POST request to the configured webhook URL. It supports:

- Multiple webhooks per project, each with multiple triggers (event + table pairs)
- HMAC-SHA256 request signing via a per-webhook `secret`
- Configurable retry with exponential backoff
- Request/response logging for debugging and resending
- Enable/disable toggle per webhook

The frontend already provides a complete UI for managing webhooks. The connector-node needs to:

1. **Store** webhook configurations (received from the backend API or created via local routes)
2. **Match** CRUD events against registered triggers
3. **Deliver** HTTP POST requests to webhook URLs
4. **Log** every delivery attempt (success or failure)
5. **Retry** failed deliveries with exponential backoff
6. **Expose routes** for webhook CRUD and log retrieval

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                   connector-node                      │
│                                                       │
│  ┌─────────────┐    ┌──────────────┐                 │
│  │ DynamicModel │───▶│  HookEngine  │                │
│  │   Route      │    │ (after hook) │                │
│  └─────────────┘    └──────┬───────┘                 │
│                            │                          │
│                            ▼                          │
│                   ┌────────────────┐                  │
│                   │ WebhookEngine  │                  │
│                   │ (match & fire) │                  │
│                   └───────┬────────┘                  │
│                           │                           │
│              ┌────────────┼────────────┐              │
│              ▼            ▼            ▼              │
│     ┌──────────────┐ ┌──────────┐ ┌──────────────┐  │
│     │WebhookExecutor│ │Webhook   │ │WebhookLogger │  │
│     │(HTTP delivery)│ │Store     │ │(log attempts) │  │
│     └──────────────┘ │(config)  │ └──────────────┘  │
│                       └──────────┘                    │
└──────────────────────────────────────────────────────┘
```

**Data flow:**
1. A CRUD operation completes in `DynamicModelRoute` (e.g., `insert`)
2. `HookEngine.instance.runAfter()` fires registered after-hooks
3. `WebhookEngine.instance.dispatch()` is called with the event, table name, and result data
4. `WebhookStore` is queried for active webhooks with triggers matching `(event, table)`
5. For each matching webhook, `WebhookExecutor.deliver()` sends an HTTP POST
6. `WebhookLogger` records the attempt (request/response/status/timing)
7. On failure, the engine schedules a retry based on `maxRetries` and `retryBackoff`

---

## Frontend Compatibility Reference

The frontend already has a working webhook UI. The connector-node routes **must** serve data shapes the frontend expects. Below are the exact types and endpoints the frontend uses.

### Frontend Types (`frontend/src/lib/types/models/webhook.type.ts`)

```typescript
type WebhookEvent = "CREATE" | "READ" | "UPDATE" | "DELETE";

type WebhookTrigger = {
  event: WebhookEvent;
  table: string;           // NOTE: field is "table", not "tableName"
};

type WebhookLog = {
  id: string;
  webhookId: string;
  timestamp: Date;
  requestBody: Record<string, unknown>;
  responseStatus: number;
  responseBody: Record<string, unknown> | string;
  success: boolean;         // NOTE: boolean, not a status enum
  error?: string;
};

type Webhook = {
  id: string;
  name: string;
  url: string;
  description: string;
  triggers: WebhookTrigger[];
  logs: WebhookLog[];       // Nested in each webhook response
  enabled: boolean;         // NOTE: field is "enabled", not "isActive"
  createdAt: Date;
  updatedAt: Date;
};
```

### Frontend API Endpoints (`frontend/src/api/webhook/`)

| Function | HTTP | URL | Notes |
|----------|------|-----|-------|
| `getWebhooks(projectId)` | `GET` | `/webhook/{projectId}` | Returns `Webhook[]` |
| `createWebhook(projectId, data)` | `POST` | `/projects/{projectId}/webhooks` | Creates webhook |
| `getWebhookById(id)` | `GET` | `/webhooks/{id}` | Single webhook |
| `updateWebhook(id, data)` | `PUT` | `/webhooks/{id}` | Update webhook |
| `deleteWebhook(id)` | `DELETE` | `/webhooks/{id}` | Delete webhook |
| `resendWebhookLog(webhookId, logId)` | `POST` | `/webhooks/{webhookId}/logs/{logId}/resend` | Resend failed |

> **Important:** The frontend has inconsistent URL patterns (`/webhook/:projectId` for list vs `/webhooks/:id` for single). The connector-node routes should match these exactly, OR the frontend endpoints should be updated to a consistent pattern. The recommended approach is to normalize to `/webhooks/...` and update the single `getWebhooks` frontend call.

### Frontend Zod Schema (`frontend/src/lib/schemas/webhook.ts`)

```typescript
createWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  description: z.string().max(500).optional(),
  triggersTables: z.array(z.string()).min(1),      // Array of table names
  triggersEvents: z.array(z.enum(["CREATE", "READ", "UPDATE", "DELETE"])).min(1),
  enabled: z.boolean().default(true),
});
```

Note: The form sends `triggersTables` and `triggersEvents` as separate arrays. The connector-node should convert these into `WebhookTrigger[]` (cartesian product of events x tables, or matched pairs — check `CreateWebhookForm.tsx` for exact behavior).

---

## Data Structures & Types

Create `src/inc/types/webhook.ts`. Reuse the existing `Operation` type from `modelCustomizer.ts` for event types.

```typescript
import type { Operation } from "./modelCustomizer";

// Alias for clarity — same as Operation: "CREATE" | "READ" | "UPDATE" | "DELETE"
export type WebhookEvent = Operation;

// ─── Core Models (aligned with frontend Webhook type) ───

export interface WebhookTrigger {
  id: string;
  webhookId: string;
  event: WebhookEvent;
  table: string;              // "table" to match frontend type, not "tableName"
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
  enabled: boolean;           // "enabled" to match frontend type, not "isActive"
  secret: string | null;      // For HMAC-SHA256 signing
  maxRetries: number;         // Default: 3
  retryBackoff: number;       // Base backoff in ms. Default: 1000
  timeout: number;            // Request timeout in ms. Default: 10000
  headers: Record<string, string> | null; // Custom HTTP headers
  triggers: WebhookTrigger[];
  logs: WebhookLog[];         // Frontend expects logs nested in webhook
  createdAt: Date;
  updatedAt: Date;
}

// ─── Internal log entry (richer than what frontend sees) ───

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

// ─── DTOs ───

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
  triggers: { event: WebhookEvent; table: string }[];
}

export interface UpdateWebhookDto extends Partial<CreateWebhookDto> {}

// ─── Delivery Payload (sent to webhook URL) ───

export interface WebhookPayload {
  id: string;                // Unique delivery ID
  timestamp: string;          // ISO 8601
  event: WebhookEvent;
  table: string;
  data: unknown;              // The CRUD result data
  metadata: {
    webhookId: string;
    webhookName: string;
    attempt: number;
    projectId?: string;
  };
}

// ─── Delivery Result (internal) ───

export interface DeliveryResult {
  success: boolean;
  responseStatus: number | null;
  responseBody: unknown;
  responseHeaders: Record<string, string> | null;
  responseTime: number;
  errorMessage: string | null;
}
```

---

## Core Components

All singletons should follow the codebase pattern: `static #instance` with a `static get instance()` getter (matching `HookEngine`, `CustomizationStore`, `ServerMounter`, etc.).

### 1. WebhookStore

**File:** `src/inc/services/webhook-store.ts`

Manages webhook configurations in memory with file persistence (mirroring `CustomizationStore`'s pattern using `graceful-fs` and `findProjectRoot()`).

```typescript
import fs from "graceful-fs";
import path from "path";
import { randomUUID } from "crypto";
import { findProjectRoot } from "../utils/file-handler";
import type {
  WebhookConfig,
  WebhookEvent,
  CreateWebhookDto,
  UpdateWebhookDto,
} from "../types/webhook";

const WEBHOOKS_FILE_NAME = "dbmanager-webhooks.json";

export class WebhookStore {
  static #instance: WebhookStore;
  private webhooks: Map<string, WebhookConfig> = new Map();

  static get instance() {
    if (!this.#instance) this.#instance = new WebhookStore();
    return this.#instance;
  }

  // ─── CRUD ───

  add(dto: CreateWebhookDto): WebhookConfig {
    const id = randomUUID();
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.webhooks.set(id, config);
    this.save();
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
    this.save();
    return existing;
  }

  remove(id: string): boolean {
    const deleted = this.webhooks.delete(id);
    if (deleted) this.save();
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

  // ─── Persistence (mirrors CustomizationStore pattern) ───

  load(): void {
    const rootDir = findProjectRoot();
    const filePath = path.join(rootDir, WEBHOOKS_FILE_NAME);
    if (!fs.existsSync(filePath)) return;

    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const configs: WebhookConfig[] = JSON.parse(raw);
      this.webhooks.clear();
      for (const c of configs) {
        this.webhooks.set(c.id, c);
      }
    } catch (e) {
      console.error("Failed to parse " + WEBHOOKS_FILE_NAME, e);
    }
  }

  private save(): void {
    const rootDir = findProjectRoot();
    const filePath = path.join(rootDir, WEBHOOKS_FILE_NAME);
    fs.writeFileSync(
      filePath,
      JSON.stringify(this.getAll(), null, 2),
      "utf-8"
    );
  }
}
```

---

### 2. WebhookExecutor

**File:** `src/inc/services/webhook-executor.ts`

Handles HTTP delivery. Uses `axios` (already a project dependency).

```typescript
import axios from "axios";
import crypto from "crypto";
import type { WebhookConfig, WebhookPayload, DeliveryResult } from "../types/webhook";

export class WebhookExecutor {
  static async deliver(
    webhook: WebhookConfig,
    payload: WebhookPayload
  ): Promise<DeliveryResult> {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "ConnectorNode-Webhook/1.0",
      "X-Webhook-Id": webhook.id,
      "X-Webhook-Event": payload.event,
      "X-Webhook-Timestamp": payload.timestamp,
      "X-Webhook-Delivery": payload.id,
      ...(webhook.headers ?? {}),
    };

    // Sign if secret is configured
    if (webhook.secret) {
      headers["X-Webhook-Signature"] = WebhookExecutor.sign(body, webhook.secret);
    }

    const startTime = Date.now();

    try {
      const response = await axios.post(webhook.url, body, {
        headers,
        timeout: webhook.timeout,
        validateStatus: () => true, // Don't throw on non-2xx
      });

      const responseTime = Date.now() - startTime;
      const success = response.status >= 200 && response.status < 300;

      return {
        success,
        responseStatus: response.status,
        responseBody: response.data,
        responseHeaders: response.headers as Record<string, string>,
        responseTime,
        errorMessage: success ? null : `HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        success: false,
        responseStatus: null,
        responseBody: null,
        responseHeaders: null,
        responseTime: Date.now() - startTime,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  static sign(body: string, secret: string): string {
    return (
      "sha256=" +
      crypto.createHmac("sha256", secret).update(body).digest("hex")
    );
  }
}
```

---

### 3. WebhookLogger

**File:** `src/inc/services/webhook-logger.ts`

Stores delivery logs in memory with a rolling window. Logs are also pushed into the parent `WebhookConfig.logs[]` array so they are included when the frontend fetches a webhook.

```typescript
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

    // Also push into the webhook config so GET /webhooks/:id returns logs
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
            : (entry.responseBody as Record<string, unknown>) ?? {},
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
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

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
```

---

### 4. WebhookEngine

**File:** `src/inc/services/webhook-engine.ts`

The orchestrator. Wires together store, executor, and logger.

```typescript
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
      responseBody: result.responseBody as Record<string, unknown> | string,
      responseHeaders: result.responseHeaders,
      responseTime: result.responseTime,
      success: result.success,
      error: result.errorMessage ?? undefined,
      triggeredEvent: event,
      triggeredTable: table,
      attemptCount: attempt,
      nextRetryAt:
        !result.success && attempt < webhook.maxRetries
          ? new Date(Date.now() + webhook.retryBackoff * Math.pow(2, attempt - 1))
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
```

---

## Integration with Existing Code

### Where hooks live in the CRUD flow

Looking at the actual code in `BaseDynamicRoute.ts`, each method:
1. Calls `this.hooks.runBefore(tableName, operation, body)` — note: **table first, then operation**
2. Calls the database handler
3. Calls `this.hooks.runAfter(tableName, operation, result)`
4. **Returns** the result (the `RouterManager` wrapper sets `ctx.body`)

### Adding webhook dispatch to `BaseDynamicRoute.ts`

Add a **non-blocking** dispatch call after the after-hook in each method that has a complete CRUD flow. The dispatch must not block the response — use `.catch()` to swallow errors.

**`getData` (READ)** — line ~135:
```typescript
public async getData(ctx: Context) {
  // ... existing code ...
  const after = await this.hooks.runAfter(this.baseModelName, "READ", {
    rows,
    total,
  });

  // >>> Add webhook dispatch <<<
  WebhookEngine.instance
    .dispatch("READ", String(this.baseModelName), after)
    .catch((err) => console.error("[Webhook] dispatch error:", err));

  return after;
}
```

**`insert` (CREATE)** — line ~223:
```typescript
public async insert(ctx: Context) {
  // ... existing code ...
  const after = await this.hooks.runAfter(this.baseModelName, "CREATE", rows);

  // >>> Add webhook dispatch <<<
  WebhookEngine.instance
    .dispatch("CREATE", String(this.baseModelName), after)
    .catch((err) => console.error("[Webhook] dispatch error:", err));

  return after;
}
```

**`update` (UPDATE)** — line ~254:
```typescript
public async update(ctx: Context) {
  // ... existing code ...
  const after = await this.hooks.runAfter(this.baseModelName, "UPDATE", rows);

  // >>> Add webhook dispatch <<<
  WebhookEngine.instance
    .dispatch("UPDATE", String(this.baseModelName), after)
    .catch((err) => console.error("[Webhook] dispatch error:", err));

  return after;
}
```

**`delete` (DELETE)** — line ~227:

> **Note:** The `delete` method is currently partially implemented — the DB call and after-hook are commented out. When completing the delete implementation, add the webhook dispatch after the after-hook, following the same pattern.

```typescript
public async delete(ctx: Context) {
  const body = (ctx.request.body ?? {}) as DBManagerSchema.DeleteBy<typeof this.baseModelName>;
  const before = await this.hooks.runBefore(this.baseModelName, "DELETE", body);

  const db = ServerMounter.instance.databaseHandler;
  if (!db) throw new Error("Database handler not initialized");

  const rows = await db.delete({
    table: String(this.baseModelName),
    where: before.where,
  });

  const after = await this.hooks.runAfter(this.baseModelName, "DELETE", rows);

  // >>> Add webhook dispatch <<<
  WebhookEngine.instance
    .dispatch("DELETE", String(this.baseModelName), after)
    .catch((err) => console.error("[Webhook] dispatch error:", err));

  return after;
}
```

**`getSingleData`** — This method does **not** run after-hooks in the current code, so skip webhook dispatch here unless you also add after-hook support.

### Adding the import

Add to the top of `BaseDynamicRoute.ts`:

```typescript
import { WebhookEngine } from "../services/webhook-engine";
```

---

## API Routes

Add webhook management routes to `RouterManager` in `src/inc/router/router.ts`. These use the existing `Route` type pattern and `this.addRoute()`.

### New method: `generateWebhookRoutes()`

```typescript
import { WebhookStore } from "../services/webhook-store";
import { WebhookLogger } from "../services/webhook-logger";
import { WebhookEngine } from "../services/webhook-engine";
import type { CreateWebhookDto, UpdateWebhookDto } from "../types/webhook";

// Add this method to RouterManager class:
generateWebhookRoutes() {
  const webhookRoutes: Route[] = [
    // List all webhooks (frontend: GET /webhook/:projectId — but projectId is ignored
    // since connector-node serves a single project)
    {
      path: "/webhooks",
      method: "get",
      callback: () => WebhookStore.instance.getAll(),
    },

    // Get single webhook
    {
      path: "/webhooks/:id",
      method: "get",
      callback: (ctx) => {
        const webhook = WebhookStore.instance.get(ctx.params.id);
        if (!webhook) { ctx.status = 404; return { error: "Not found" }; }
        return webhook;
      },
    },

    // Create webhook
    {
      path: "/webhooks",
      method: "post",
      callback: (ctx) => {
        const dto = ctx.request.body as CreateWebhookDto;
        const webhook = WebhookStore.instance.add(dto);
        ctx.status = 201;
        return webhook;
      },
    },

    // Update webhook
    {
      path: "/webhooks/:id",
      method: "put",
      callback: (ctx) => {
        const dto = ctx.request.body as UpdateWebhookDto;
        return WebhookStore.instance.update(ctx.params.id, dto);
      },
    },

    // Delete webhook
    {
      path: "/webhooks/:id",
      method: "delete",
      callback: (ctx) => {
        WebhookStore.instance.remove(ctx.params.id);
        return { success: true };
      },
    },

    // Get logs for a webhook
    {
      path: "/webhooks/:id/logs",
      method: "get",
      callback: (ctx) => {
        const limit = Number(ctx.query.limit) || 20;
        const offset = Number(ctx.query.offset) || 0;
        return WebhookLogger.instance.getByWebhookId(ctx.params.id, {
          limit,
          offset,
        });
      },
    },

    // Resend a failed log entry
    {
      path: "/webhooks/:webhookId/logs/:logId/resend",
      method: "post",
      callback: async (ctx) => {
        await WebhookEngine.instance.resend(ctx.params.logId);
        return { success: true };
      },
    },
  ];

  webhookRoutes.forEach((route) => this.addRoute(route));
}
```

Then call `this.routerManager.generateWebhookRoutes()` from `getConnectCallback()` in `serverMounter.ts`, right after `generateDefaultRoutes()` and before `generateRoutesFromSchema()`.

---

## Request Signing

When a webhook has a `secret` configured, every delivery includes an `X-Webhook-Signature` header.

**Signing algorithm:** HMAC-SHA256

```
X-Webhook-Signature: sha256=<hex(HMAC-SHA256(secret, requestBody))>
```

**Receiver-side verification example:**

```typescript
import crypto from "crypto";

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

---

## Retry Strategy

Failed deliveries are retried with **exponential backoff**:

```
delay = retryBackoff * 2^(attempt - 1)
```

| Attempt | Delay (backoff=1000ms) |
|---------|----------------------|
| 1 (initial) | immediate |
| 2 (1st retry) | 1s |
| 3 (2nd retry) | 2s |
| 4 (3rd retry) | 4s |

**Defaults:**
- `maxRetries`: 3 (up to 4 total attempts: 1 initial + 3 retries)
- `retryBackoff`: 1000ms
- `timeout`: 10000ms per request

**Success criteria:** HTTP 2xx response status.

Retries use `setTimeout` in-process. For high-volume production, consider replacing with a job queue (e.g., BullMQ).

---

## Payload Format

Every webhook delivery sends a JSON POST body:

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "timestamp": "2026-03-15T14:30:00.000Z",
  "event": "CREATE",
  "table": "users",
  "data": {
    "id": 42,
    "name": "John Doe",
    "email": "john@example.com"
  },
  "metadata": {
    "webhookId": "wh_abc123",
    "webhookName": "New User Notifications",
    "attempt": 1,
    "projectId": "proj_xyz"
  }
}
```

**Standard headers:**

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |
| `User-Agent` | `ConnectorNode-Webhook/1.0` |
| `X-Webhook-Id` | Webhook ID |
| `X-Webhook-Event` | `CREATE` / `READ` / `UPDATE` / `DELETE` |
| `X-Webhook-Timestamp` | ISO 8601 timestamp |
| `X-Webhook-Delivery` | Unique delivery ID |
| `X-Webhook-Signature` | HMAC signature (only if secret is set) |

---

## File Structure

```
src/inc/
├── services/
│   ├── hook-engine.ts            # Existing — no changes
│   ├── integration-registry.ts   # Existing — no changes
│   ├── action-registry.ts        # Existing — no changes
│   ├── webhook-engine.ts         # NEW — orchestrator
│   ├── webhook-executor.ts       # NEW — HTTP delivery
│   ├── webhook-logger.ts         # NEW — log storage
│   └── webhook-store.ts          # NEW — config storage + file persistence
├── types/
│   ├── db.ts                     # Existing
│   ├── global.ts                 # Existing
│   ├── modelCustomizer.ts        # Existing (reuse Operation type)
│   └── webhook.ts                # NEW — all webhook types
├── models/
│   └── BaseDynamicRoute.ts       # MODIFY — add dispatch calls after after-hooks
├── router/
│   └── router.ts                 # MODIFY — add generateWebhookRoutes()
└── core/
    ├── connector.ts              # MODIFY — expose webhook API on Connector class
    └── serverMounter.ts          # MODIFY — init webhook store, call generateWebhookRoutes()
```

---

## Step-by-Step Implementation

### Step 1: Define types

Create `src/inc/types/webhook.ts` with all interfaces from the [Data Structures & Types](#data-structures--types) section. Import `Operation` from `./modelCustomizer` to reuse as `WebhookEvent`.

### Step 2: Implement WebhookStore

Create `src/inc/services/webhook-store.ts`. Follow `CustomizationStore`'s pattern:
- Singleton via `static #instance` + `static get instance()`
- File persistence via `graceful-fs` to `dbmanager-webhooks.json`
- Use `findProjectRoot()` for the file path (from `utils/file-handler`)

### Step 3: Implement WebhookExecutor

Create `src/inc/services/webhook-executor.ts`. Use `axios` (already a dependency). Static methods only — no state.

### Step 4: Implement WebhookLogger

Create `src/inc/services/webhook-logger.ts`. Singleton. In-memory array with per-webhook rolling window. Push simplified log entries into `WebhookConfig.logs[]` so the frontend receives them when fetching webhooks.

### Step 5: Implement WebhookEngine

Create `src/inc/services/webhook-engine.ts`. Singleton. Wire together store, executor, and logger. Key methods: `dispatch()`, `resend()`, `shutdown()`.

### Step 6: Hook into CRUD operations

Modify `src/inc/models/BaseDynamicRoute.ts`:
- Add `import { WebhookEngine } from "../services/webhook-engine";`
- In `getData` (after line 139), `insert` (after line 224), and `update` (after line 254), add a non-blocking `WebhookEngine.instance.dispatch(...)` call
- In `delete`, add the dispatch when completing the currently-commented-out implementation
- Do **not** add dispatch in `getSingleData` (no after-hook support)

### Step 7: Add webhook API routes

Modify `src/inc/router/router.ts`:
- Add `generateWebhookRoutes()` method to `RouterManager`
- Register 7 routes using the existing `Route` type + `this.addRoute()` pattern
- Routes handle CRUD, logs, and resend

### Step 8: Initialize on startup

Modify `src/inc/core/serverMounter.ts`:
- In `getConnectCallback()`, call `this.routerManager.generateWebhookRoutes()` after `generateDefaultRoutes()` and before `generateRoutesFromSchema()`

Modify `src/inc/core/connector.ts`:
- In `start()`, after `CustomizationStore.instance.load()`, add `WebhookStore.instance.load()`

### Step 9: Export from package entry point

In `src/index.ts`, add:

```typescript
export { WebhookEngine } from "./inc/services/webhook-engine";
export { WebhookStore } from "./inc/services/webhook-store";
```

This allows consumers to programmatically add webhooks:

```typescript
import Connector, { WebhookStore } from "@sentrodb/connector-node";

const connector = new Connector(config);
await connector.start();

// Programmatically add a webhook
WebhookStore.instance.add({
  name: "Notify on new users",
  url: "https://example.com/webhook",
  triggers: [{ event: "CREATE", table: "users" }],
});
```

### Step 10: Test

1. Start the connector with a database connected
2. Create a webhook via `POST /webhooks` targeting `CREATE` on a test table
3. Insert a record via `POST /{table}/insert`
4. Verify the webhook URL receives the POST payload
5. Check `GET /webhooks` — the webhook should have a log entry in its `logs` array
6. Test failure: point to an unreachable URL, verify retries occur (3 attempts)
7. Test resend: `POST /webhooks/:id/logs/:logId/resend`
8. Test enable/disable: `PUT /webhooks/:id` with `{ enabled: false }`, insert another record, verify no webhook fires
