"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamicModelRoute = exports.BaseDynamicModelRoutes = void 0;
const serverMounter_1 = __importDefault(require("../core/serverMounter"));
const tableCustomizer_1 = require("../customizers/tableCustomizer");
const constants_1 = require("../utils/constants");
const customizationStore_1 = require("../core/customizationStore");
const hook_engine_1 = require("../services/hook-engine");
const action_registry_1 = require("../services/action-registry");
const webhook_engine_1 = require("../services/webhook-engine");
const approval_store_1 = require("../services/approval-store");
const approval_http_1 = require("../utils/approval-http");
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
function splitM2MPayload(table, payload) {
    const m2mColumns = table.columns.filter((c) => c.isMany && c.junction && c.references);
    if (!m2mColumns.length) {
        return { data: payload, junctions: [] };
    }
    const pkColumn = table.columns.find((c) => c.primary_key)?.name;
    if (!pkColumn) {
        // No PK means we can't fan out — strip M2M keys and let the parent write proceed.
        const data = {};
        const m2mNames = new Set(m2mColumns.map((c) => c.name));
        for (const [k, v] of Object.entries(payload))
            if (!m2mNames.has(k))
                data[k] = v;
        return { data, junctions: [] };
    }
    const data = {};
    const junctions = [];
    const consumed = new Set();
    for (const col of m2mColumns) {
        const incoming = payload[col.name];
        if (incoming === undefined)
            continue;
        consumed.add(col.name);
        if (!Array.isArray(incoming))
            continue;
        junctions.push({
            junctionTable: col.junction.table,
            sourceColumn: col.junction.sourceColumn,
            targetColumn: col.junction.targetColumn,
            parentSourceColumn: pkColumn,
            targetIds: incoming,
        });
    }
    for (const [k, v] of Object.entries(payload)) {
        if (!consumed.has(k))
            data[k] = v;
    }
    return { data, junctions };
}
class BaseDynamicModelRoutes {
    constructor(baseModelName) {
        this.hooks = hook_engine_1.HookEngine.instance;
        this.baseModelName = baseModelName;
        this.customizer = new tableCustomizer_1.TableCustomizer(this.baseModelName);
    }
    getModelPath() {
        return `/${String(this.baseModelName)}`;
    }
    getSubPath(subPath) {
        return this.getModelPath() + "/" + subPath;
    }
    getSchemaTable() {
        const inst = serverMounter_1.default.instance;
        if (!inst?.schemaDetails?.tables) {
            throw new Error("Server not initialized: missing schema details");
        }
        const table = inst.schemaDetails.tables.find((t) => t.name === this.baseModelName);
        if (!table) {
            throw new Error(`Schema details not found for table "${String(this.baseModelName)}"`);
        }
        return table;
    }
    getColumnNames() {
        if (!this._columnNames) {
            const cols = this.getColumns();
            this._columnsCache = cols;
            this._columnNames = new Set(cols.map((c) => c.name));
        }
        return this._columnNames;
    }
    getColumns() {
        const table = this.getSchemaTable();
        return table.columns;
    }
}
exports.BaseDynamicModelRoutes = BaseDynamicModelRoutes;
class DynamicModelRoute extends BaseDynamicModelRoutes {
    constructor(model) {
        super(model);
    }
    async getData(ctx) {
        const body = (ctx.request.body ?? {});
        const before = await this.hooks.runBefore(this.baseModelName, "READ", body);
        const segmentSlug = ctx.request.query?.segment ||
            before.segment;
        const segment = segmentSlug
            ? customizationStore_1.CustomizationStore.instance
                .getCustomization(this.baseModelName)
                .customization.segments?.find((s) => s.slug === segmentSlug)
            : undefined;
        const segmentConditions = segment?.conditions ?? [];
        const adHocConditions = Array.isArray(before.conditions)
            ? (before.conditions ?? [])
            : [];
        const combinedConditions = [...segmentConditions, ...adHocConditions];
        const rawLimit = Number(before.limit);
        const rawOffset = Number(before.offset);
        const limit = Number.isFinite(rawLimit)
            ? Math.max(1, Math.min(1000, rawLimit))
            : 20;
        const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0;
        const validOrderDir = (d) => d === "asc" || d === "desc" ? d : "asc";
        const orderDirection = validOrderDir(before.orderDirection);
        const rawSearch = (before.search ?? "").toString().trim();
        let searchColumns = Array.isArray(before.searchColumns)
            ? before.searchColumns
            : [];
        let orderBy = (before.orderBy ?? "").toString();
        const where = before.where && typeof before.where === "object"
            ? before.where
            : undefined;
        // whitelist against known columns
        const columnNames = this.getColumnNames();
        if (!orderBy || !columnNames.has(orderBy)) {
            orderBy = undefined; // pass undefined to disable ordering
        }
        if (searchColumns.length) {
            searchColumns = searchColumns.filter((c) => columnNames.has(c));
            if (!searchColumns.length)
                searchColumns = [];
        }
        const search = rawSearch.length ? rawSearch : undefined;
        const db = serverMounter_1.default.instance.databaseHandler;
        if (!db)
            throw new Error("Database handler not initialized");
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
            : Number(rawCount?.count ?? rawCount ?? 0);
        const after = await this.hooks.runAfter(this.baseModelName, "READ", {
            rows,
            total,
        });
        webhook_engine_1.WebhookEngine.instance
            .dispatch("READ", String(this.baseModelName), after)
            .catch((err) => console.error("[Webhook] dispatch error:", err));
        return after;
    }
    async getSingleData(ctx) {
        const body = (ctx.request.body ?? {});
        const columnNames = this.getColumnNames();
        if (!body?.column || !columnNames.has(body.column)) {
            ctx.status = 400;
            return { error: "Invalid column" };
        }
        const db = serverMounter_1.default.instance.databaseHandler;
        if (!db)
            throw new Error("Database handler not initialized");
        const data = await db.getSingle({
            table: String(this.baseModelName),
            where: {
                [body.column]: body.value,
            },
        });
        if (!data || typeof data !== "object")
            return data;
        const table = this.getSchemaTable();
        const m2mColumns = table.columns.filter((c) => c.isMany && c.junction);
        const pkColumn = table.columns.find((c) => c.primary_key)?.name;
        if (!m2mColumns.length || !pkColumn)
            return data;
        const pkValue = data[pkColumn];
        if (pkValue === undefined || pkValue === null)
            return data;
        await Promise.all(m2mColumns.map(async (col) => {
            const ids = await db.getRelatedIds({
                junctionTable: col.junction.table,
                sourceColumn: col.junction.sourceColumn,
                sourceValue: pkValue,
                targetColumn: col.junction.targetColumn,
            });
            data[col.name] = ids;
        }));
        return data;
    }
    async addTableCustomization(ctx) {
        const body = (ctx.request.body ?? {});
        // Merge with defaults and existing schema table customization as you already do
        const table = serverMounter_1.default.instance.schemaDetails.tables.find((t) => t.name === this.baseModelName);
        if (!table) {
            ctx.status = 404;
            return { error: "Table not found" };
        }
        const merged = {
            ...constants_1.EMPTY_TABLE_CUSTOMIZATION,
            ...(table.customization ?? {}),
            ...(body ?? {}),
        };
        // Persist to the central store
        customizationStore_1.CustomizationStore.instance.addCustomization({
            name: this.baseModelName,
            customization: merged,
            columns: [],
        });
        return merged;
    }
    async addColumnCustomization(ctx) {
        const body = (ctx.request.body ?? {});
        const columnNames = this.getColumnNames();
        if (!columnNames.has(body.column)) {
            ctx.status = 400;
            return { error: `Unknown column "${body.column}"` };
        }
        customizationStore_1.CustomizationStore.instance.addColumnCustomization(this.baseModelName, body.column, body.customization ?? {});
        return body;
    }
    async insert(ctx) {
        const body = (ctx.request.body ?? {});
        try {
            (0, approval_http_1.requireApproval)(ctx, {
                kind: "CRUD",
                table: String(this.baseModelName),
                op: "CREATE",
                payload: body,
            });
        }
        catch (e) {
            if (e instanceof approval_store_1.ApprovalRequiredError)
                return (0, approval_http_1.respondWithPending)(ctx, e);
            throw e;
        }
        const before = await this.hooks.runBefore(this.baseModelName, "CREATE", body);
        const written = await this.hooks.applyFieldWriters(this.baseModelName, "CREATE", before);
        const db = serverMounter_1.default.instance.databaseHandler;
        if (!db)
            throw new Error("Database handler not initialized");
        const { data, junctions } = splitM2MPayload(this.getSchemaTable(), written);
        const rows = await db.insert({
            table: String(this.baseModelName),
            data: data,
            junctions: junctions.length ? junctions : undefined,
        });
        const after = await this.hooks.runAfter(this.baseModelName, "CREATE", rows);
        webhook_engine_1.WebhookEngine.instance
            .dispatch("CREATE", String(this.baseModelName), after)
            .catch((err) => console.error("[Webhook] dispatch error:", err));
        return after;
    }
    async delete(ctx) {
        const body = ctx.request.body;
        const records = Array.isArray(body) ? body : [];
        if (!records.length) {
            ctx.status = 400;
            return { error: "No records provided" };
        }
        try {
            (0, approval_http_1.requireApproval)(ctx, {
                kind: "CRUD",
                table: String(this.baseModelName),
                op: "DELETE",
                payload: records,
            });
        }
        catch (e) {
            if (e instanceof approval_store_1.ApprovalRequiredError)
                return (0, approval_http_1.respondWithPending)(ctx, e);
            throw e;
        }
        const before = (await this.hooks.runBefore(this.baseModelName, "DELETE", records));
        const table = this.getSchemaTable();
        const primaryColumns = table.columns
            .filter((c) => c.primary_key)
            .map((c) => c.name);
        const columnNames = this.getColumnNames();
        const keyed = [];
        const unkeyed = [];
        for (const record of before) {
            const hasAllPks = primaryColumns.length > 0 &&
                primaryColumns.every((col) => record?.[col] !== undefined);
            if (hasAllPks)
                keyed.push(record);
            else
                unkeyed.push(record);
        }
        const db = serverMounter_1.default.instance.databaseHandler;
        if (!db)
            throw new Error("Database handler not initialized");
        if (keyed.length) {
            const where = {};
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
            const where = {};
            for (const [col, val] of Object.entries(record)) {
                if (val === undefined || val === null)
                    continue;
                if (!columnNames.has(col))
                    continue;
                if (typeof val === "object")
                    continue;
                where[col] = [val];
            }
            if (!Object.keys(where).length)
                continue;
            await db.delete({
                table: String(this.baseModelName),
                where,
                single: false,
            });
        }
        const after = await this.hooks.runAfter(this.baseModelName, "DELETE", records);
        webhook_engine_1.WebhookEngine.instance
            .dispatch("DELETE", String(this.baseModelName), after)
            .catch((err) => console.error("[Webhook] dispatch error:", err));
        return after;
    }
    async update(ctx) {
        const body = (ctx.request.body ?? {});
        try {
            (0, approval_http_1.requireApproval)(ctx, {
                kind: "CRUD",
                table: String(this.baseModelName),
                op: "UPDATE",
                payload: body,
            });
        }
        catch (e) {
            if (e instanceof approval_store_1.ApprovalRequiredError)
                return (0, approval_http_1.respondWithPending)(ctx, e);
            throw e;
        }
        const before = await this.hooks.runBefore(this.baseModelName, "UPDATE", body);
        const patch = await this.hooks.applyFieldWriters(this.baseModelName, "UPDATE", (before.patch ?? {}));
        const db = serverMounter_1.default.instance.databaseHandler;
        if (!db)
            throw new Error("Database handler not initialized");
        const { data, junctions } = splitM2MPayload(this.getSchemaTable(), patch);
        const rows = await db.update({
            table: String(this.baseModelName),
            data: data,
            where: before.where,
            junctions: junctions.length ? junctions : undefined,
        });
        const after = await this.hooks.runAfter(this.baseModelName, "UPDATE", rows);
        webhook_engine_1.WebhookEngine.instance
            .dispatch("UPDATE", String(this.baseModelName), after)
            .catch((err) => console.error("[Webhook] dispatch error:", err));
        return after;
    }
    async getRelatedIds(ctx) {
        const body = (ctx.request.body ?? {});
        if (!body.relationName || body.sourceValue === undefined) {
            ctx.status = 400;
            return { error: "Missing relationName or sourceValue" };
        }
        const table = this.getSchemaTable();
        const m2mColumn = table.columns.find((c) => c.name === body.relationName && c.isMany && !!c.junction);
        if (!m2mColumn?.junction) {
            ctx.status = 404;
            return { error: `No many-to-many relation "${body.relationName}" on ${String(this.baseModelName)}` };
        }
        const db = serverMounter_1.default.instance.databaseHandler;
        if (!db)
            throw new Error("Database handler not initialized");
        const ids = await db.getRelatedIds({
            junctionTable: m2mColumn.junction.table,
            sourceColumn: m2mColumn.junction.sourceColumn,
            sourceValue: body.sourceValue,
            targetColumn: m2mColumn.junction.targetColumn,
        });
        return { ids };
    }
    async callTableAction(ctx) {
        const tableName = this.baseModelName;
        const body = (ctx.request.body ?? {});
        const segmentId = body.segmentId || this.resolveSegmentIdFromQuery(ctx);
        const action = action_registry_1.ActionRegistry.instance.getTableAction(tableName, body.actionId, segmentId);
        if (!action) {
            ctx.status = 404;
            return { success: false, error: "Table Action not found" };
        }
        try {
            console.log("Table Action called", action);
            const db = serverMounter_1.default.instance.databaseHandler;
            await action(ctx.request, body.records, db);
            return { success: true };
        }
        catch (error) {
            return { success: false, error };
        }
    }
    async callRecordAction(ctx) {
        const tableName = this.baseModelName;
        const body = (ctx.request.body ?? {});
        const segmentId = body.segmentId || this.resolveSegmentIdFromQuery(ctx);
        const action = action_registry_1.ActionRegistry.instance.getDetailAction(tableName, body.actionId, segmentId);
        if (!action) {
            ctx.status = 404;
            return { success: false, error: "Record Action not found" };
        }
        try {
            console.log("Record Action called", action);
            const db = serverMounter_1.default.instance.databaseHandler;
            await action(ctx.request, body.record, db);
            return { success: true };
        }
        catch (error) {
            return { success: false, error };
        }
    }
    /**
     * Resolve a segment id from a `segment` query/body slug by consulting the
     * customization store. Returns undefined when no matching segment exists.
     */
    resolveSegmentIdFromQuery(ctx) {
        const slug = ctx.request.query?.segment ||
            ctx.request.body?.segment;
        if (!slug)
            return undefined;
        const customization = customizationStore_1.CustomizationStore.instance.getCustomization(this.baseModelName);
        return customization.customization.segments?.find((s) => s.slug === slug)?.id;
    }
    getRoutes() {
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
exports.DynamicModelRoute = DynamicModelRoute;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQmFzZUR5bmFtaWNSb3V0ZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9pbmMvbW9kZWxzL0Jhc2VEeW5hbWljUm91dGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQ0EsMEVBQWtEO0FBQ2xELG9FQUFpRTtBQUVqRSxrREFBK0Q7QUFHL0QsbUVBQWdFO0FBQ2hFLHlEQUFxRDtBQUNyRCxpRUFBNkQ7QUFDN0QsK0RBQTJEO0FBQzNELCtEQUFtRTtBQUNuRSwwREFBNkU7QUFHN0U7Ozs7Ozs7Ozs7R0FVRztBQUNILFNBQVMsZUFBZSxDQUN0QixLQUEyQixFQUMzQixPQUE0QjtJQUU1QixNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sSUFBSSxDQUFDLENBQUMsUUFBUSxJQUFJLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUN2RixJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ3ZCLE9BQU8sRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUUsQ0FBQztJQUMxQyxDQUFDO0lBRUQsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsRUFBRSxJQUFJLENBQUM7SUFDaEUsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2Qsa0ZBQWtGO1FBQ2xGLE1BQU0sSUFBSSxHQUF3QixFQUFFLENBQUM7UUFDckMsTUFBTSxRQUFRLEdBQUcsSUFBSSxHQUFHLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDeEQsS0FBSyxNQUFNLENBQUMsQ0FBQyxFQUFF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