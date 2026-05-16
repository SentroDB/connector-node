import { Context } from "koa";
import ServerMounter from "../core/serverMounter";
import { TableCustomizer } from "../customizers/tableCustomizer";
import { GetDataBody, Route } from "../types/global";
import { EMPTY_TABLE_CUSTOMIZATION } from "../utils/constants";
import type DBManagerTypes from "@sentrodb/connector-node-types";
import { CustomColumn, CustomTable } from "@sentrodb/connector-node-types";
import { CustomizationStore } from "../core/customizationStore";
import { HookEngine } from "../services/hook-engine";
import { ActionRegistry } from "../services/action-registry";
import { WebhookEngine } from "../services/webhook-engine";
import { ApprovalRequiredError } from "../services/approval-store";
import { requireApproval, respondWithPending } from "../utils/approval-http";
import type { JunctionWriteSpec } from "../types/db";

/**
 * Split a write payload into "real column" data and per-relation M2M target
 * id arrays, using the table's synthetic many-to-many columns. Payload keys
 * matching an `isMany` column are treated as M2M arrays; everything else
 * passes through to the parent insert/update.
 *
 * The synthetic column has no underlying SQL column on the parent table, so
 * we also need a real column to write the parent's PK from when fanning out
 * junction rows. Prisma implicit M2M always references the parent's PK, so
 * we use whatever PK column the parent table has.
 */
function splitM2MPayload(
  table: DBManagerTypes.Table,
  payload: Record<string, any>,
): { data: Record<string, any>; junctions: JunctionWriteSpec[] } {
  const m2mColumns = table.columns.filter((c) => c.isMany && c.junction && c.references);
  if (!m2mColumns.length) {
    return { data: payload, junctions: [] };
  }

  const pkColumn = table.columns.find((c) => c.primary_key)?.name;
  if (!pkColumn) {
    // No PK means we can't fan out — strip M2M keys and let the parent write proceed.
    const data: Record<string, any> = {};
    const m2mNames = new Set(m2mColumns.map((c) => c.name));
    for (const [k, v] of Object.entries(payload)) if (!m2mNames.has(k)) data[k] = v;
    return { data, junctions: [] };
  }

  const data: Record<string, any> = {};
  const junctions: JunctionWriteSpec[] = [];
  const consumed = new Set<string>();

  for (const col of m2mColumns) {
    const incoming = payload[col.name];
    if (incoming === undefined) continue;
    consumed.add(col.name);
    if (!Array.isArray(incoming)) continue;
    junctions.push({
      junctionTable: col.junction!.table,
      sourceColumn: col.junction!.sourceColumn,
      targetColumn: col.junction!.targetColumn,
      parentSourceColumn: pkColumn,
      targetIds: incoming,
    });
  }

  for (const [k, v] of Object.entries(payload)) {
    if (!consumed.has(k)) data[k] = v;
  }

  return { data, junctions };
}

export abstract class BaseDynamicModelRoutes {
  public baseModelName: DBManagerSchema.TableName;
  public hooks = HookEngine.instance;

  public customizer: TableCustomizer;
  private _columnNames?: Set<string>;
  private _columnsCache?: Array<{ name: string }>;

  constructor(baseModelName: DBManagerSchema.TableName) {
    this.baseModelName = baseModelName;
    this.customizer = new TableCustomizer(this.baseModelName as DBManagerSchema.TableName);
  }

  public getModelPath(): string {
    return `/${String(this.baseModelName)}`;
  }

  public getSubPath(subPath: string): string {
    return this.getModelPath() + "/" + subPath;
  }

  protected getSchemaTable() {
    const inst = ServerMounter.instance;
    if (!inst?.schemaDetails?.tables) {
      throw new Error("Server not initialized: missing schema details");
    }
    const table = inst.schemaDetails.tables.find(
      (t) => t.name === this.baseModelName
    );
    if (!table) {
      throw new Error(
        `Schema details not found for table "${String(this.baseModelName)}"`
      );
    }
    return table;
  }

  protected getColumnNames(): Set<string> {
    if (!this._columnNames) {
      const cols = this.getColumns();
      this._columnsCache = cols as any;
      this._columnNames = new Set<string>(cols.map((c: any) => c.name));
    }
    return this._columnNames!;
  }

  public getColumns() {
    const table = this.getSchemaTable();
    return table.columns;
  }
}

export class DynamicModelRoute extends BaseDynamicModelRoutes {
  constructor(model: DBManagerSchema.TableName) {
    super(model);
  }

  public async getData(ctx: Context) {
    const body = (ctx.request.body ?? {}) as GetDataBody & {
      segment?: string;
      conditions?: DBManagerTypes.SegmentCondition[];
    };

    const before = await this.hooks.runBefore(this.baseModelName, "READ", body);

    const segmentSlug =
      (ctx.request.query?.segment as string | undefined) ||
      (before as { segment?: string }).segment;
    const segment = segmentSlug
      ? CustomizationStore.instance
        .getCustomization(this.baseModelName)
        .customization.segments?.find((s) => s.slug === segmentSlug)
      : undefined;
    const segmentConditions = segment?.conditions ?? [];
    const adHocConditions = Array.isArray(
      (before as { conditions?: unknown }).conditions,
    )
      ? ((before as { conditions: DBManagerTypes.SegmentCondition[] }).conditions ?? [])
      : [];
    const combinedConditions = [...segmentConditions, ...adHocConditions];

    const rawLimit = Number(before.limit);
    const rawOffset = Number(before.offset);
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(1000, rawLimit))
      : 20;
    const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0;

    const validOrderDir = (d: unknown): "asc" | "desc" =>
      d === "asc" || d === "desc" ? d : "asc";
    const orderDirection = validOrderDir(before.orderDirection);

    const rawSearch = (before.search ?? "").toString().trim();
    let searchColumns = Array.isArray(before.searchColumns)
      ? before.searchColumns
      : [];
    let orderBy = (before.orderBy ?? "").toString();

    const where =
      before.where && typeof before.where === "object"
        ? before.where
        : undefined;

    // whitelist against known columns
    const columnNames = this.getColumnNames();

    if (!orderBy || !columnNames.has(orderBy)) {
      orderBy = undefined as any; // pass undefined to disable ordering
    }

    if (searchColumns.length) {
      searchColumns = searchColumns.filter((c) => columnNames.has(c));
      if (!searchColumns.length) searchColumns = [];
    }

    const search = rawSearch.length ? rawSearch : undefined;

    const db = ServerMounter.instance.databaseHandler;
    if (!db) throw new Error("Database handler not initialized");

    const rows = await db.get({
      table: String(this.baseModelName),
      where,
      limit,
      offset,
      orderBy,
      orderDirection,
      search,
      searchColumns: searchColumns.length ? searchColumns : undefined,
      columns: before.columns,
      extraConditions: combinedConditions.length ? combinedConditions : undefined,
    });

    const rawCount = await db.count({
      table: String(this.baseModelName),
      where,
      search,
      searchColumns: searchColumns.length ? searchColumns : undefined,
      extraConditions: combinedConditions.length ? combinedConditions : undefined,
    });

    const total = Array.isArray(rawCount)
      ? Number(rawCount[0]?.count ?? 0)
      : Number((rawCount as any)?.count ?? rawCount ?? 0);

    const after = await this.hooks.runAfter(this.baseModelName, "READ", {
      rows,
      total,
    });

    WebhookEngine.instance
      .dispatch("READ", String(this.baseModelName), after)
      .catch((err) => console.error("[Webhook] dispatch error:", err));

    return after;
  }

  public async getSingleData(ctx: Context) {
    const body = (ctx.request.body ?? {}) as { column: string; value: string };

    const columnNames = this.getColumnNames();
    if (!body?.column || !columnNames.has(body.column)) {
      ctx.status = 400;
      return { error: "Invalid column" };
    }

    const db = ServerMounter.instance.databaseHandler;
    if (!db) throw new Error("Database handler not initialized");

    const data = await db.getSingle({
      table: String(this.baseModelName),
      where: {
        [body.column]: body.value,
      },
    });

    if (!data || typeof data !== "object") return data;

    const table = this.getSchemaTable();
    const m2mColumns = table.columns.filter((c) => c.isMany && c.junction);
    const pkColumn = table.columns.find((c) => c.primary_key)?.name;
    if (!m2mColumns.length || !pkColumn) return data;

    const pkValue = (data as Record<string, any>)[pkColumn];
    if (pkValue === undefined || pkValue === null) return data;

    await Promise.all(
      m2mColumns.map(async (col) => {
        const ids = await db.getRelatedIds({
          junctionTable: col.junction!.table,
          sourceColumn: col.junction!.sourceColumn,
          sourceValue: pkValue,
          targetColumn: col.junction!.targetColumn,
        });
        (data as Record<string, any>)[col.name] = ids;
      }),
    );

    return data;
  }

  public async addTableCustomization(ctx: Context) {
    const body = (ctx.request.body ?? {}) as Partial<CustomTable>;
    // Merge with defaults and existing schema table customization as you already do
    const table = ServerMounter.instance.schemaDetails.tables.find(
      (t) => t.name === this.baseModelName
    );
    if (!table) {
      ctx.status = 404;
      return { error: "Table not found" };
    }

    const merged = {
      ...EMPTY_TABLE_CUSTOMIZATION,
      ...(table.customization ?? {}),
      ...(body ?? {}),
    };

    // Persist to the central store
    CustomizationStore.instance.addCustomization({
      name: this.baseModelName,
      customization: merged,
      columns: [],
    });

    return merged;
  }

  public async addColumnCustomization(ctx: Context) {
    const body = (ctx.request.body ?? {}) as {
      column: string;
      customization: Partial<CustomColumn>;
    };
    const columnNames = this.getColumnNames();
    if (!columnNames.has(body.column)) {
      ctx.status = 400;
      return { error: `Unknown column "${body.column}"` };
    }

    CustomizationStore.instance.addColumnCustomization(
      this.baseModelName,
      body.column,
      body.customization ?? {}
    );
    return body;
  }

  public async insert(ctx: Context) {
    const body = (ctx.request.body ?? {}) as DBManagerSchema.InsertBy<typeof this.baseModelName>;

    try {
      requireApproval(ctx, {
        kind: "CRUD",
        table: String(this.baseModelName),
        op: "CREATE",
        payload: body,
      });
    } catch (e) {
      if (e instanceof ApprovalRequiredError) return respondWithPending(ctx, e);
      throw e;
    }

    const before = await this.hooks.runBefore(this.baseModelName, "CREATE", body);

    const db = ServerMounter.instance.databaseHandler;
    if (!db) throw new Error("Database handler not initialized");

    const { data, junctions } = splitM2MPayload(this.getSchemaTable(), before);

    const rows = await db.insert({
      table: String(this.baseModelName),
      data: data as any,
      junctions: junctions.length ? junctions : undefined,
    });

    const after = await this.hooks.runAfter(this.baseModelName, "CREATE", rows);

    WebhookEngine.instance
      .dispatch("CREATE", String(this.baseModelName), after)
      .catch((err) => console.error("[Webhook] dispatch error:", err));

    return after;
  }

  public async delete(ctx: Context) {
    const body = ctx.request.body;
    const records = Array.isArray(body) ? (body as Array<Record<string, any>>) : [];

    if (!records.length) {
      ctx.status = 400;
      return { error: "No records provided" };
    }

    try {
      requireApproval(ctx, {
        kind: "CRUD",
        table: String(this.baseModelName),
        op: "DELETE",
        payload: records,
      });
    } catch (e) {
      if (e instanceof ApprovalRequiredError) return respondWithPending(ctx, e);
      throw e;
    }

    const before = (await this.hooks.runBefore(
      this.baseModelName,
      "DELETE",
      records
    )) as Array<Record<string, any>>;

    const table = this.getSchemaTable();
    const primaryColumns = (table.columns as any[])
      .filter((c) => c.primary_key)
      .map((c) => c.name);
    const columnNames = this.getColumnNames();

    const keyed: Array<Record<string, any>> = [];
    const unkeyed: Array<Record<string, any>> = [];

    for (const record of before) {
      const hasAllPks =
        primaryColumns.length > 0 &&
        primaryColumns.every(
          (col) => record?.[col] !== undefined
        );
      if (hasAllPks) keyed.push(record);
      else unkeyed.push(record);
    }

    const db = ServerMounter.instance.databaseHandler;
    if (!db) throw new Error("Database handler not initialized");

    if (keyed.length) {
      const where: Record<string, any[]> = {};
      for (const col of primaryColumns) {
        where[col] = keyed.map((r) => r[col]);
      }
      await db.delete({
        table: String(this.baseModelName),
        where,
        single: false,
      });
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
      await db.delete({
        table: String(this.baseModelName),
        where,
        single: false,
      });
    }

    const after = await this.hooks.runAfter(this.baseModelName, "DELETE", records);

    WebhookEngine.instance
      .dispatch("DELETE", String(this.baseModelName), after)
      .catch((err) => console.error("[Webhook] dispatch error:", err));

    return after;
  }

  public async update(ctx: Context) {
    const body = (ctx.request.body ?? {}) as DBManagerSchema.UpdateBy<typeof this.baseModelName>;

    try {
      requireApproval(ctx, {
        kind: "CRUD",
        table: String(this.baseModelName),
        op: "UPDATE",
        payload: body,
      });
    } catch (e) {
      if (e instanceof ApprovalRequiredError) return respondWithPending(ctx, e);
      throw e;
    }

    const before = await this.hooks.runBefore(this.baseModelName, "UPDATE", body);
    const db = ServerMounter.instance.databaseHandler;
    if (!db) throw new Error("Database handler not initialized");

    const { data, junctions } = splitM2MPayload(
      this.getSchemaTable(),
      (before.patch ?? {}) as Record<string, any>,
    );

    const rows = await db.update({
      table: String(this.baseModelName),
      data: data as any,
      where: before.where,
      junctions: junctions.length ? junctions : undefined,
    });
    const after = await this.hooks.runAfter(this.baseModelName, "UPDATE", rows);

    WebhookEngine.instance
      .dispatch("UPDATE", String(this.baseModelName), after)
      .catch((err) => console.error("[Webhook] dispatch error:", err));

    return after;
  }

  public async getRelatedIds(ctx: Context) {
    const body = (ctx.request.body ?? {}) as {
      relationName?: string;
      sourceValue?: any;
    };
    if (!body.relationName || body.sourceValue === undefined) {
      ctx.status = 400;
      return { error: "Missing relationName or sourceValue" };
    }

    const table = this.getSchemaTable();
    const m2mColumn = table.columns.find(
      (c) => c.name === body.relationName && c.isMany && !!c.junction,
    );
    if (!m2mColumn?.junction) {
      ctx.status = 404;
      return { error: `No many-to-many relation "${body.relationName}" on ${String(this.baseModelName)}` };
    }

    const db = ServerMounter.instance.databaseHandler;
    if (!db) throw new Error("Database handler not initialized");

    const ids = await db.getRelatedIds({
      junctionTable: m2mColumn.junction.table,
      sourceColumn: m2mColumn.junction.sourceColumn,
      sourceValue: body.sourceValue,
      targetColumn: m2mColumn.junction.targetColumn,
    });

    return { ids };
  }

  public async callTableAction(ctx: Context) {
    const tableName = this.baseModelName;
    const body = (ctx.request.body ?? {}) as {
      actionId: string;
      records: DBManagerSchema.RowBy<typeof tableName>[];
      segmentId?: string;
    };
    const segmentId = body.segmentId || this.resolveSegmentIdFromQuery(ctx);
    const action = ActionRegistry.instance.getTableAction(tableName, body.actionId, segmentId);
    if (!action) {
      ctx.status = 404;
      return { success: false, error: "Table Action not found" };
    }
    try {
      console.log("Table Action called", action);
      const db = ServerMounter.instance.databaseHandler;
      await action(ctx.request, body.records, db);
      return { success: true };
    } catch (error) {
      return { success: false, error };
    }
  }

  public async callRecordAction(ctx: Context) {
    const tableName = this.baseModelName;
    const body = (ctx.request.body ?? {}) as {
      actionId: string;
      record: DBManagerSchema.RowBy<typeof tableName>;
      segmentId?: string;
    };
    const segmentId = body.segmentId || this.resolveSegmentIdFromQuery(ctx);
    const action = ActionRegistry.instance.getDetailAction(tableName, body.actionId, segmentId);
    if (!action) {
      ctx.status = 404;
      return { success: false, error: "Record Action not found" };
    }
    try {
      console.log("Record Action called", action);
      const db = ServerMounter.instance.databaseHandler;
      await action(ctx.request, body.record, db);
      return { success: true };
    } catch (error) {
      return { success: false, error };
    }
  }

  /**
   * Resolve a segment id from a `segment` query/body slug by consulting the
   * customization store. Returns undefined when no matching segment exists.
   */
  protected resolveSegmentIdFromQuery(ctx: Context): string | undefined {
    const slug =
      (ctx.request.query?.segment as string | undefined) ||
      (ctx.request.body as { segment?: string } | undefined)?.segment;
    if (!slug) return undefined;
    const customization = CustomizationStore.instance.getCustomization(this.baseModelName);
    return customization.customization.segments?.find((s) => s.slug === slug)?.id;
  }

  public getRoutes(): Route[] {
    return [
      {
        path: this.getSubPath("getColumns"),
        method: "get",
        callback: (ctx) => this.getColumns(),
      },
      {
        path: this.getSubPath("getData"),
        method: "post",
        callback: (ctx) => this.getData(ctx),
      },
      {
        path: this.getSubPath("getSingleData"),
        method: "post",
        callback: (ctx) => this.getSingleData(ctx),
      },
      {
        path: this.getSubPath("customize-table"),
        method: "post",
        callback: (ctx) => this.addTableCustomization(ctx),
      },
      {
        path: this.getSubPath("customize-column"),
        method: "post",
        callback: (ctx) => this.addColumnCustomization(ctx),
      },
      {
        path: this.getSubPath("insert"),
        method: "post",
        callback: (ctx) => this.insert(ctx),
      },
      {
        path: this.getSubPath("delete"),
        method: "post",
        callback: (ctx) => this.delete(ctx),
      },
      {
        path: this.getSubPath("update"),
        method: "post",
        callback: (ctx) => this.update(ctx),
      },
      {
        path: this.getSubPath("getRelatedIds"),
        method: "post",
        callback: (ctx) => this.getRelatedIds(ctx),
      },
      {
        path: this.getSubPath("table-action"),
        method: "post",
        callback: (ctx) => this.callTableAction(ctx),
      },
      {
        path: this.getSubPath("record-action"),
        method: "post",
        callback: (ctx) => this.callRecordAction(ctx),
      }
    ];
  }
}
