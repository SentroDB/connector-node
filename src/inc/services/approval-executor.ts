import ServerMounter from "../core/serverMounter";
import { ApprovalContext } from "./approval-context";
import { ApprovalStore } from "./approval-store";
import { WebhookEngine } from "./webhook-engine";
import type {
  ApprovalAction,
  ApprovalRequest,
  CrudOp,
} from "../types/approval";
import { HookEngine } from "./hook-engine";

/**
 * Replays an APPROVED request using the original requester identity.
 * Bypasses the approval gate via ApprovalContext.isReplay.
 */
export class ApprovalExecutor {
  static #instance: ApprovalExecutor;
  static get instance() {
    if (!this.#instance) this.#instance = new ApprovalExecutor();
    return this.#instance;
  }

  async execute(requestId: string): Promise<ApprovalRequest> {
    const store = ApprovalStore.instance;
    const req = store.getRequest(requestId);
    if (!req) throw new Error(`Request ${requestId} not found`);
    if (req.status !== "APPROVED") {
      throw new Error(`Request ${requestId} is not APPROVED`);
    }

    // Re-check policy still exists & matches at replay time
    const policy = store.getPolicy(req.policyId);
    if (!policy) {
      const failed = store.markExecutionFailed(
        requestId,
        "Policy was removed before execution"
      );
      return failed;
    }

    try {
      await ApprovalContext.run(
        { requester: req.requester, isReplay: true },
        async () => {
          await this.runAction(req.action);
        }
      );
      return store.markExecuted(requestId);
    } catch (e: any) {
      const message = e?.message ?? String(e);
      return store.markExecutionFailed(requestId, message);
    }
  }

  private async runAction(action: ApprovalAction): Promise<void> {
    if (action.kind === "CRUD") {
      await this.runCrud(action.table, action.op, action.payload);
      return;
    }
    if (action.kind === "ADVANCED_QUERY") {
      await this.runAdvancedQuery(action.sql);
      return;
    }
    if (action.kind === "SCHEMA_CHANGE") {
      // Schema replay is left to a dedicated handler — placeholder so the
      // approval lifecycle still completes deterministically.
      throw new Error("SCHEMA_CHANGE replay is not yet implemented");
    }
  }

  private async runCrud(
    table: string,
    op: CrudOp,
    payload: unknown
  ): Promise<void> {
    const db = ServerMounter.instance.databaseHandler;
    if (!db) throw new Error("Database handler not initialized");
    const tableName = table as DBManagerSchema.TableName;
    const hooks = HookEngine.instance;

    if (op === "CREATE") {
      const data = payload as Record<string, unknown>;
      const before = await hooks.runBefore(tableName, "CREATE", data as any);
      const rows = await db.insert({ table, data: before as any });
      const after = await hooks.runAfter(tableName, "CREATE", rows as any);
      WebhookEngine.instance.dispatch("CREATE", table, after).catch(() => {});
      return;
    }

    if (op === "UPDATE") {
      const body = payload as {
        where: Record<string, unknown>;
        patch: Record<string, unknown>;
      };
      const before = await hooks.runBefore(tableName, "UPDATE", body as any);
      const rows = await db.update({
        table,
        data: (before as any).patch,
        where: (before as any).where,
      });
      const after = await hooks.runAfter(tableName, "UPDATE", rows as any);
      WebhookEngine.instance.dispatch("UPDATE", table, after).catch(() => {});
      return;
    }

    if (op === "DELETE") {
      const records = (
        Array.isArray(payload) ? payload : []
      ) as Array<Record<string, any>>;
      if (!records.length) return;
      const before = (await hooks.runBefore(
        tableName,
        "DELETE",
        records as any
      )) as Array<Record<string, any>>;

      const schema = ServerMounter.instance.schemaDetails;
      const tableMeta = schema.tables.find((t) => t.name === table);
      const primaryColumns = (tableMeta?.columns ?? [])
        .filter((c: any) => c.primary_key)
        .map((c: any) => c.name);
      const columnNames = new Set(
        (tableMeta?.columns ?? []).map((c: any) => c.name)
      );

      const keyed: Array<Record<string, any>> = [];
      const unkeyed: Array<Record<string, any>> = [];
      for (const record of before) {
        const hasAllPks =
          primaryColumns.length > 0 &&
          primaryColumns.every((col: string) => record?.[col] !== undefined);
        if (hasAllPks) keyed.push(record);
        else unkeyed.push(record);
      }

      if (keyed.length) {
        const where: Record<string, any[]> = {};
        for (const col of primaryColumns) {
          where[col] = keyed.map((r) => r[col]);
        }
        await db.delete({ table, where, single: false });
      }

      for (const record of unkeyed) {
        const where: Record<string, any[]> = {};
        for (const [col, val] of Object.entries(record)) {
          if (val === undefined || val === null) continue;
          if (!columnNames.has(col)) continue;
          if (typeof val === "object") continue;
          where[col] = [val];
        }
        if (!Object.keys(where).length) continue;
        await db.delete({ table, where, single: false });
      }

      const after = await hooks.runAfter(
        tableName,
        "DELETE",
        records as any
      );
      WebhookEngine.instance.dispatch("DELETE", table, after).catch(() => {});
    }
  }

  private async runAdvancedQuery(sql: string): Promise<void> {
    const db = ServerMounter.instance.databaseHandler;
    if (!db) throw new Error("Database handler not initialized");
    await db.query({
      sql,
      schema: ServerMounter.instance.config?.db?.schema,
    });
  }
}
