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
/**
 * A write is only safe to run when it is scoped by at least one constraint.
 * An update/delete with a missing or empty `where` targets the entire table,
 * so we treat that as a client error rather than silently mutating every row.
 */
function hasWhereConstraints(where) {
    return (!!where &&
        typeof where === "object" &&
        !Array.isArray(where) &&
        Object.keys(where).length > 0);
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
        if (!hasWhereConstraints(before.where)) {
            ctx.status = 400;
            return {
                error: "Refusing to update without a `where` clause — this would affect every row.",
            };
        }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQmFzZUR5bmFtaWNSb3V0ZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9pbmMvbW9kZWxzL0Jhc2VEeW5hbWljUm91dGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQ0EsMEVBQWtEO0FBQ2xELG9FQUFpRTtBQUVqRSxrREFBK0Q7QUFHL0QsbUVBQWdFO0FBQ2hFLHlEQUFxRDtBQUNyRCxpRUFBNkQ7QUFDN0QsK0RBQTJEO0FBQzNELCtEQUFtRTtBQUNuRSwwREFBNkU7QUFHN0U7Ozs7Ozs7Ozs7R0FVRztBQUNILFNBQVMsZUFBZSxDQUN0QixLQUEyQixFQUMzQixPQUE0QjtJQUU1QixNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sSUFBSSxDQUFDLENBQUMsUUFBUSxJQUFJLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUN2RixJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ3ZCLE9BQU8sRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUUsQ0FBQztJQUMxQyxDQUFDO0lBRUQsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsRUFBRSxJQUFJLENBQUM7SUFDaEUsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2Qsa0ZBQWtGO1FBQ2xGLE1BQU0sSUFBSSxHQUF3QixFQUFFLENBQUM7UUFDckMsTUFBTSxRQUFRLEdBQUcsSUFBSSxHQUFHLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDeEQsS0FBSyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDO1lBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDaEYsT0FBTyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsRUFBRSxFQUFFLENBQUM7SUFDakMsQ0FBQztJQUVELE1BQU0sSUFBSSxHQUF3QixFQUFFLENBQUM7SUFDckMsTUFBTSxTQUFTLEdBQXdCLEVBQUUsQ0FBQztJQUMxQyxNQUFNLFFBQVEsR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO0lBRW5DLEtBQUssTUFBTSxHQUFHLElBQUksVUFBVSxFQUFFLENBQUM7UUFDN0IsTUFBTSxRQUFRLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNuQyxJQUFJLFFBQVEsS0FBSyxTQUFTO1lBQUUsU0FBUztRQUNyQyxRQUFRLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN2QixJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUM7WUFBRSxTQUFTO1FBQ3ZDLFNBQVMsQ0FBQyxJQUFJLENBQUM7WUFDYixhQUFhLEVBQUUsR0FBRyxDQUFDLFFBQVMsQ0FBQyxLQUFLO1lBQ2xDLFlBQVksRUFBRSxHQUFHLENBQUMsUUFBUyxDQUFDLFlBQVk7WUFDeEMsWUFBWSxFQUFFLEdBQUcsQ0FBQyxRQUFTLENBQUMsWUFBWTtZQUN4QyxrQkFBa0IsRUFBRSxRQUFRO1lBQzVCLFNBQVMsRUFBRSxRQUFRO1NBQ3BCLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRCxLQUFLLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1FBQzdDLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDcEMsQ0FBQztJQUVELE9BQU8sRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLENBQUM7QUFDN0IsQ0FBQztBQUVEOzs7O0dBSUc7QUFDSCxTQUFTLG1CQUFtQixDQUFDLEtBQWM7SUFDekMsT0FBTyxDQUNMLENBQUMsQ0FBQyxLQUFLO1FBQ1AsT0FBTyxLQUFLLEtBQUssUUFBUTtRQUN6QixDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDO1FBQ3JCLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBZ0MsQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQ3pELENBQUM7QUFDSixDQUFDO0FBRUQsTUFBc0Isc0JBQXNCO0lBUTFDLFlBQVksYUFBd0M7UUFON0MsVUFBSyxHQUFHLHdCQUFVLENBQUMsUUFBUSxDQUFDO1FBT2pDLElBQUksQ0FBQyxhQUFhLEdBQUcsYUFBYSxDQUFDO1FBQ25DLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxpQ0FBZSxDQUFDLElBQUksQ0FBQyxhQUEwQyxDQUFDLENBQUM7SUFDekYsQ0FBQztJQUVNLFlBQVk7UUFDakIsT0FBTyxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztJQUMxQyxDQUFDO0lBRU0sVUFBVSxDQUFDLE9BQWU7UUFDL0IsT0FBTyxJQUFJLENBQUMsWUFBWSxFQUFFLEdBQUcsR0FBRyxHQUFHLE9BQU8sQ0FBQztJQUM3QyxDQUFDO0lBRVMsY0FBYztRQUN0QixNQUFNLElBQUksR0FBRyx1QkFBYSxDQUFDLFFBQVEsQ0FBQztRQUNwQyxJQUFJLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRSxNQUFNLEVBQUUsQ0FBQztZQUNqQyxNQUFNLElBQUksS0FBSyxDQUFDLGdEQUFnRCxDQUFDLENBQUM7UUFDcEUsQ0FBQztRQUNELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLElBQUksQ0FDMUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLGFBQWEsQ0FDckMsQ0FBQztRQUNGLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNYLE1BQU0sSUFBSSxLQUFLLENBQ2IsdUNBQXVDLE1BQU0sQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FDckUsQ0FBQztRQUNKLENBQUM7UUFDRCxPQUFPLEtBQUssQ0FBQztJQUNmLENBQUM7SUFFUyxjQUFjO1FBQ3RCLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDdkIsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQy9CLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBVyxDQUFDO1lBQ2pDLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxHQUFHLENBQVMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQU0sRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDcEUsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDLFlBQWEsQ0FBQztJQUM1QixDQUFDO0lBRU0sVUFBVTtRQUNmLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUNwQyxPQUFPLEtBQUssQ0FBQyxPQUFPLENBQUM7SUFDdkIsQ0FBQztDQUNGO0FBbERELHdEQWtEQztBQUVELE1BQWEsaUJBQWtCLFNBQVEsc0JBQXNCO0lBQzNELFlBQVksS0FBZ0M7UUFDMUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ2YsQ0FBQztJQUVNLEtBQUssQ0FBQyxPQUFPLENBQUMsR0FBWTtRQUMvQixNQUFNLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FHbkMsQ0FBQztRQUVGLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFNUUsTUFBTSxXQUFXLEdBQ2QsR0FBRyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsT0FBOEI7WUFDakQsTUFBK0IsQ0FBQyxPQUFPLENBQUM7UUFDM0MsTUFBTSxPQUFPLEdBQUcsV0FBVztZQUN6QixDQUFDLENBQUMsdUNBQWtCLENBQUMsUUFBUTtpQkFDMUIsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQztpQkFDcEMsYUFBYSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssV0FBVyxDQUFDO1lBQzlELENBQUMsQ0FBQyxTQUFTLENBQUM7UUFDZCxNQUFNLGlCQUFpQixHQUFHLE9BQU8sRUFBRSxVQUFVLElBQUksRUFBRSxDQUFDO1FBQ3BELE1BQU0sZUFBZSxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQ2xDLE1BQW1DLENBQUMsVUFBVSxDQUNoRDtZQUNDLENBQUMsQ0FBQyxDQUFFLE1BQTRELENBQUMsVUFBVSxJQUFJLEVBQUUsQ0FBQztZQUNsRixDQUFDLENBQUMsRUFBRSxDQUFDO1FBQ1AsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLEdBQUcsaUJBQWlCLEVBQUUsR0FBRyxlQUFlLENBQUMsQ0FBQztRQUV0RSxNQUFNLFFBQVEsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3RDLE1BQU0sU0FBUyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDeEMsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUM7WUFDckMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQ3ZDLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDUCxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRXZFLE1BQU0sYUFBYSxHQUFHLENBQUMsQ0FBVSxFQUFrQixFQUFFLENBQ25ELENBQUMsS0FBSyxLQUFLLElBQUksQ0FBQyxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7UUFDMUMsTUFBTSxjQUFjLEdBQUcsYUFBYSxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUU1RCxNQUFNLFNBQVMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxNQUFNLElBQUksRUFBRSxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDMUQsSUFBSSxhQUFhLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDO1lBQ3JELENBQUMsQ0FBQyxNQUFNLENBQUMsYUFBYTtZQUN0QixDQUFDLENBQUMsRUFBRSxDQUFDO1FBQ1AsSUFBSSxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsT0FBTyxJQUFJLEVBQUUsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBRWhELE1BQU0sS0FBSyxHQUNULE1BQU0sQ0FBQyxLQUFLLElBQUksT0FBTyxNQUFNLENBQUMsS0FBSyxLQUFLLFFBQVE7WUFDOUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLO1lBQ2QsQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUVoQixrQ0FBa0M7UUFDbEMsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBRTFDLElBQUksQ0FBQyxPQUFPLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDMUMsT0FBTyxHQUFHLFNBQWdCLENBQUMsQ0FBQyxxQ0FBcUM7UUFDbkUsQ0FBQztRQUVELElBQUksYUFBYSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ3pCLGFBQWEsR0FBRyxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDaEUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNO2dCQUFFLGFBQWEsR0FBRyxFQUFFLENBQUM7UUFDaEQsQ0FBQztRQUVELE1BQU0sTUFBTSxHQUFHLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1FBRXhELE1BQU0sRUFBRSxHQUFHLHVCQUFhLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQztRQUNsRCxJQUFJLENBQUMsRUFBRTtZQUFFLE1BQU0sSUFBSSxLQUFLLENBQUMsa0NBQWtDLENBQUMsQ0FBQztRQUU3RCxNQUFNLElBQUksR0FBRyxNQUFNLEVBQUUsQ0FBQyxHQUFHLENBQUM7WUFDeEIsS0FBSyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDO1lBQ2pDLEtBQUs7WUFDTCxLQUFLO1lBQ0wsTUFBTTtZQUNOLE9BQU87WUFDUCxjQUFjO1lBQ2QsTUFBTTtZQUNOLGFBQWEsRUFBRSxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLFNBQVM7WUFDL0QsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPO1lBQ3ZCLGVBQWUsRUFBRSxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxTQUFTO1NBQzVFLENBQUMsQ0FBQztRQUVILE1BQU0sUUFBUSxHQUFHLE1BQU0sRUFBRSxDQUFDLEtBQUssQ0FBQztZQUM5QixLQUFLLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUM7WUFDakMsS0FBSztZQUNMLE1BQU07WUFDTixhQUFhLEVBQUUsYUFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxTQUFTO1lBQy9ELGVBQWUsRUFBRSxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxTQUFTO1NBQzVFLENBQUMsQ0FBQztRQUVILE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDO1lBQ25DLENBQUMsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssSUFBSSxDQUFDLENBQUM7WUFDakMsQ0FBQyxDQUFDLE1BQU0sQ0FBRSxRQUFnQixFQUFFLEtBQUssSUFBSSxRQUFRLElBQUksQ0FBQyxDQUFDLENBQUM7UUFFdEQsTUFBTSxLQUFLLEdBQUcsTUFBTSxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLE1BQU0sRUFBRTtZQUNsRSxJQUFJO1lBQ0osS0FBSztTQUNOLENBQUMsQ0FBQztRQUVILDhCQUFhLENBQUMsUUFBUTthQUNuQixRQUFRLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEVBQUUsS0FBSyxDQUFDO2FBQ25ELEtBQUssQ0FBQyxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQywyQkFBMkIsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBRW5FLE9BQU8sS0FBSyxDQUFDO0lBQ2YsQ0FBQztJQUVNLEtBQUssQ0FBQyxhQUFhLENBQUMsR0FBWTtRQUNyQyxNQUFNLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBc0MsQ0FBQztRQUUzRSxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDMUMsSUFBSSxDQUFDLElBQUksRUFBRSxNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQ25ELEdBQUcsQ0FBQyxNQUFNLEdBQUcsR0FBRyxDQUFDO1lBQ2pCLE9BQU8sRUFBRSxLQUFLLEVBQUUsZ0JBQWdCLEVBQUUsQ0FBQztRQUNyQyxDQUFDO1FBRUQsTUFBTSxFQUFFLEdBQUcsdUJBQWEsQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDO1FBQ2xELElBQUksQ0FBQyxFQUFFO1lBQUUsTUFBTSxJQUFJLEtBQUssQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1FBRTdELE1BQU0sSUFBSSxHQUFHLE1BQU0sRUFBRSxDQUFDLFNBQVMsQ0FBQztZQUM5QixLQUFLLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUM7WUFDakMsS0FBSyxFQUFFO2dCQUNMLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksQ0FBQyxLQUFLO2FBQzFCO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLElBQUksSUFBSSxPQUFPLElBQUksS0FBSyxRQUFRO1lBQUUsT0FBTyxJQUFJLENBQUM7UUFFbkQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQ3BDLE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN2RSxNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxFQUFFLElBQUksQ0FBQztRQUNoRSxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sSUFBSSxDQUFDLFFBQVE7WUFBRSxPQUFPLElBQUksQ0FBQztRQUVqRCxNQUFNLE9BQU8sR0FBSSxJQUE0QixDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3hELElBQUksT0FBTyxLQUFLLFNBQVMsSUFBSSxPQUFPLEtBQUssSUFBSTtZQUFFLE9BQU8sSUFBSSxDQUFDO1FBRTNELE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FDZixVQUFVLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxHQUFHLEVBQUUsRUFBRTtZQUMzQixNQUFNLEdBQUcsR0FBRyxNQUFNLEVBQUUsQ0FBQyxhQUFhLENBQUM7Z0JBQ2pDLGFBQWEsRUFBRSxHQUFHLENBQUMsUUFBUyxDQUFDLEtBQUs7Z0JBQ2xDLFlBQVksRUFBRSxHQUFHLENBQUMsUUFBUyxDQUFDLFlBQVk7Z0JBQ3hDLFdBQVcsRUFBRSxPQUFPO2dCQUNwQixZQUFZLEVBQUUsR0FBRyxDQUFDLFFBQVMsQ0FBQyxZQUFZO2FBQ3pDLENBQUMsQ0FBQztZQUNGLElBQTRCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLEdBQUcsQ0FBQztRQUNoRCxDQUFDLENBQUMsQ0FDSCxDQUFDO1FBRUYsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBRU0sS0FBSyxDQUFDLHFCQUFxQixDQUFDLEdBQVk7UUFDN0MsTUFBTSxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksSUFBSSxFQUFFLENBQXlCLENBQUM7UUFDOUQsZ0ZBQWdGO1FBQ2hGLE1BQU0sS0FBSyxHQUFHLHVCQUFhLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUM1RCxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxJQUFJLENBQUMsYUFBYSxDQUNyQyxDQUFDO1FBQ0YsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1gsR0FBRyxDQUFDLE1BQU0sR0FBRyxHQUFHLENBQUM7WUFDakIsT0FBTyxFQUFFLEtBQUssRUFBRSxpQkFBaUIsRUFBRSxDQUFDO1FBQ3RDLENBQUM7UUFFRCxNQUFNLE1BQU0sR0FBRztZQUNiLEdBQUcscUNBQXlCO1lBQzVCLEdBQUcsQ0FBQyxLQUFLLENBQUMsYUFBYSxJQUFJLEVBQUUsQ0FBQztZQUM5QixHQUFHLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQztTQUNoQixDQUFDO1FBRUYsK0JBQStCO1FBQy9CLHVDQUFrQixDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQztZQUMzQyxJQUFJLEVBQUUsSUFBSSxDQUFDLGFBQWE7WUFDeEIsYUFBYSxFQUFFLE1BQU07WUFDckIsT0FBTyxFQUFFLEVBQUU7U0FDWixDQUFDLENBQUM7UUFFSCxPQUFPLE1BQU0sQ0FBQztJQUNoQixDQUFDO0lBRU0sS0FBSyxDQUFDLHNCQUFzQixDQUFDLEdBQVk7UUFDOUMsTUFBTSxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksSUFBSSxFQUFFLENBR25DLENBQUM7UUFDRixNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDMUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7WUFDbEMsR0FBRyxDQUFDLE1BQU0sR0FBRyxHQUFHLENBQUM7WUFDakIsT0FBTyxFQUFFLEtBQUssRUFBRSxtQkFBbUIsSUFBSSxDQUFDLE1BQU0sR0FBRyxFQUFFLENBQUM7UUFDdEQsQ0FBQztRQUVELHVDQUFrQixDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsQ0FDaEQsSUFBSSxDQUFDLGFBQWEsRUFDbEIsSUFBSSxDQUFDLE1BQU0sRUFDWCxJQUFJLENBQUMsYUFBYSxJQUFJLEVBQUUsQ0FDekIsQ0FBQztRQUNGLE9BQU8sSUFBSSxDQUFDO0lBQ2QsQ0FBQztJQUVNLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBWTtRQUM5QixNQUFNLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBd0QsQ0FBQztRQUU3RixJQUFJLENBQUM7WUFDSCxJQUFBLCtCQUFlLEVBQUMsR0FBRyxFQUFFO2dCQUNuQixJQUFJLEVBQUUsTUFBTTtnQkFDWixLQUFLLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUM7Z0JBQ2pDLEVBQUUsRUFBRSxRQUFRO2dCQUNaLE9BQU8sRUFBRSxJQUFJO2FBQ2QsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDWCxJQUFJLENBQUMsWUFBWSxzQ0FBcUI7Z0JBQUUsT0FBTyxJQUFBLGtDQUFrQixFQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUMxRSxNQUFNLENBQUMsQ0FBQztRQUNWLENBQUM7UUFFRCxNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzlFLE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLEtBQUssQ0FBQyxpQkFBaUIsQ0FDaEQsSUFBSSxDQUFDLGFBQWEsRUFDbEIsUUFBUSxFQUNSLE1BQWlDLENBQ2xDLENBQUM7UUFFRixNQUFNLEVBQUUsR0FBRyx1QkFBYSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUM7UUFDbEQsSUFBSSxDQUFDLEVBQUU7WUFBRSxNQUFNLElBQUksS0FBSyxDQUFDLGtDQUFrQyxDQUFDLENBQUM7UUFFN0QsTUFBTSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsR0FBRyxlQUFlLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBRTVFLE1BQU0sSUFBSSxHQUFHLE1BQU0sRUFBRSxDQUFDLE1BQU0sQ0FBQztZQUMzQixLQUFLLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUM7WUFDakMsSUFBSSxFQUFFLElBQVc7WUFDakIsU0FBUyxFQUFFLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsU0FBUztTQUNwRCxDQUFDLENBQUM7UUFFSCxNQUFNLEtBQUssR0FBRyxNQUFNLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRTVFLDhCQUFhLENBQUMsUUFBUTthQUNuQixRQUFRLENBQUMsUUFBUSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEVBQUUsS0FBSyxDQUFDO2FBQ3JELEtBQUssQ0FBQyxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQywyQkFBMkIsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBRW5FLE9BQU8sS0FBSyxDQUFDO0lBQ2YsQ0FBQztJQUVNLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBWTtRQUM5QixNQUFNLElBQUksR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQztRQUM5QixNQUFNLE9BQU8sR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBRSxJQUFtQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFFaEYsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNwQixHQUFHLENBQUMsTUFBTSxHQUFHLEdBQUcsQ0FBQztZQUNqQixPQUFPLEVBQUUsS0FBSyxFQUFFLHFCQUFxQixFQUFFLENBQUM7UUFDMUMsQ0FBQztRQUVELElBQUksQ0FBQztZQUNILElBQUEsK0JBQWUsRUFBQyxHQUFHLEVBQUU7Z0JBQ25CLElBQUksRUFBRSxNQUFNO2dCQUNaLEtBQUssRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQztnQkFDakMsRUFBRSxFQUFFLFFBQVE7Z0JBQ1osT0FBTyxFQUFFLE9BQU87YUFDakIsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDWCxJQUFJLENBQUMsWUFBWSxzQ0FBcUI7Z0JBQUUsT0FBTyxJQUFBLGtDQUFrQixFQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUMxRSxNQUFNLENBQUMsQ0FBQztRQUNWLENBQUM7UUFFRCxNQUFNLE1BQU0sR0FBRyxDQUFDLE1BQU0sSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQ3hDLElBQUksQ0FBQyxhQUFhLEVBQ2xCLFFBQVEsRUFDUixPQUFPLENBQ1IsQ0FBK0IsQ0FBQztRQUVqQyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDcEMsTUFBTSxjQUFjLEdBQUksS0FBSyxDQUFDLE9BQWlCO2FBQzVDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQzthQUM1QixHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN0QixNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7UUFFMUMsTUFBTSxLQUFLLEdBQStCLEVBQUUsQ0FBQztRQUM3QyxNQUFNLE9BQU8sR0FBK0IsRUFBRSxDQUFDO1FBRS9DLEtBQUssTUFBTSxNQUFNLElBQUksTUFBTSxFQUFFLENBQUM7WUFDNUIsTUFBTSxTQUFTLEdBQ2IsY0FBYyxDQUFDLE1BQU0sR0FBRyxDQUFDO2dCQUN6QixjQUFjLENBQUMsS0FBSyxDQUNsQixDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxDQUFDLEtBQUssU0FBUyxDQUNyQyxDQUFDO1lBQ0osSUFBSSxTQUFTO2dCQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7O2dCQUM3QixPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzVCLENBQUM7UUFFRCxNQUFNLEVBQUUsR0FBRyx1QkFBYSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUM7UUFDbEQsSUFBSSxDQUFDLEVBQUU7WUFBRSxNQUFNLElBQUksS0FBSyxDQUFDLGtDQUFrQyxDQUFDLENBQUM7UUFFN0QsSUFBSSxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDakIsTUFBTSxLQUFLLEdBQTBCLEVBQUUsQ0FBQztZQUN4QyxLQUFLLE1BQU0sR0FBRyxJQUFJLGNBQWMsRUFBRSxDQUFDO2dCQUNqQyxLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDeEMsQ0FBQztZQUNELE1BQU0sRUFBRSxDQUFDLE1BQU0sQ0FBQztnQkFDZCxLQUFLLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUM7Z0JBQ2pDLEtBQUs7Z0JBQ0wsTUFBTSxFQUFFLEtBQUs7YUFDZCxDQUFDLENBQUM7UUFDTCxDQUFDO1FBRUQsS0FBSyxNQUFNLE1BQU0sSUFBSSxPQUFPLEVBQUUsQ0FBQztZQUM3QixNQUFNLEtBQUssR0FBMEIsRUFBRSxDQUFDO1lBQ3hDLEtBQUssTUFBTSxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7Z0JBQ2hELElBQUksR0FBRyxLQUFLLFNBQVMsSUFBSSxHQUFHLEtBQUssSUFBSTtvQkFBRSxTQUFTO2dCQUNoRCxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUM7b0JBQUUsU0FBUztnQkFDcEMsSUFBSSxPQUFPLEdBQUcsS0FBSyxRQUFRO29CQUFFLFNBQVM7Z0JBQ3RDLEtBQUssQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3JCLENBQUM7WUFDRCxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNO2dCQUFFLFNBQVM7WUFDekMsTUFBTSxFQUFFLENBQUMsTUFBTSxDQUFDO2dCQUNkLEtBQUssRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQztnQkFDakMsS0FBSztnQkFDTCxNQUFNLEVBQUUsS0FBSzthQUNkLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCxNQUFNLEtBQUssR0FBRyxNQUFNLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsUUFBUSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBRS9FLDhCQUFhLENBQUMsUUFBUTthQUNuQixRQUFRLENBQUMsUUFBUSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEVBQUUsS0FBSyxDQUFDO2FBQ3JELEtBQUssQ0FBQyxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQywyQkFBMkIsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBRW5FLE9BQU8sS0FBSyxDQUFDO0lBQ2YsQ0FBQztJQUVNLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBWTtRQUM5QixNQUFNLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBd0QsQ0FBQztRQUU3RixJQUFJLENBQUM7WUFDSCxJQUFBLCtCQUFlLEVBQUMsR0FBRyxFQUFFO2dCQUNuQixJQUFJLEVBQUUsTUFBTTtnQkFDWixLQUFLLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUM7Z0JBQ2pDLEVBQUUsRUFBRSxRQUFRO2dCQUNaLE9BQU8sRUFBRSxJQUFJO2FBQ2QsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDWCxJQUFJLENBQUMsWUFBWSxzQ0FBcUI7Z0JBQUUsT0FBTyxJQUFBLGtDQUFrQixFQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUMxRSxNQUFNLENBQUMsQ0FBQztRQUNWLENBQUM7UUFFRCxNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRTlFLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUN2QyxHQUFHLENBQUMsTUFBTSxHQUFHLEdBQUcsQ0FBQztZQUNqQixPQUFPO2dCQUNMLEtBQUssRUFDSCw0RUFBNEU7YUFDL0UsQ0FBQztRQUNKLENBQUM7UUFFRCxNQUFNLEtBQUssR0FBRyxNQUFNLElBQUksQ0FBQyxLQUFLLENBQUMsaUJBQWlCLENBQzlDLElBQUksQ0FBQyxhQUFhLEVBQ2xCLFFBQVEsRUFDUixDQUFDLE1BQU0sQ0FBQyxLQUFLLElBQUksRUFBRSxDQUE0QixDQUNoRCxDQUFDO1FBQ0YsTUFBTSxFQUFFLEdBQUcsdUJBQWEsQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDO1FBQ2xELElBQUksQ0FBQyxFQUFFO1lBQUUsTUFBTSxJQUFJLEtBQUssQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1FBRTdELE1BQU0sRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLEdBQUcsZUFBZSxDQUN6QyxJQUFJLENBQUMsY0FBYyxFQUFFLEVBQ3JCLEtBQTRCLENBQzdCLENBQUM7UUFFRixNQUFNLElBQUksR0FBRyxNQUFNLEVBQUUsQ0FBQyxNQUFNLENBQUM7WUFDM0IsS0FBSyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDO1lBQ2pDLElBQUksRUFBRSxJQUFXO1lBQ2pCLEtBQUssRUFBRSxNQUFNLENBQUMsS0FBSztZQUNuQixTQUFTLEVBQUUsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxTQUFTO1NBQ3BELENBQUMsQ0FBQztRQUNILE1BQU0sS0FBSyxHQUFHLE1BQU0sSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFNUUsOEJBQWEsQ0FBQyxRQUFRO2FBQ25CLFFBQVEsQ0FBQyxRQUFRLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsRUFBRSxLQUFLLENBQUM7YUFDckQsS0FBSyxDQUFDLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLDJCQUEyQixFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFFbkUsT0FBTyxLQUFLLENBQUM7SUFDZixDQUFDO0lBRU0sS0FBSyxDQUFDLGFBQWEsQ0FBQyxHQUFZO1FBQ3JDLE1BQU0sSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLElBQUksRUFBRSxDQUduQyxDQUFDO1FBQ0YsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLElBQUksSUFBSSxDQUFDLFdBQVcsS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUN6RCxHQUFHLENBQUMsTUFBTSxHQUFHLEdBQUcsQ0FBQztZQUNqQixPQUFPLEVBQUUsS0FBSyxFQUFFLHFDQUFxQyxFQUFFLENBQUM7UUFDMUQsQ0FBQztRQUVELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUNwQyxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FDbEMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLFlBQVksSUFBSSxDQUFDLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUNoRSxDQUFDO1FBQ0YsSUFBSSxDQUFDLFNBQVMsRUFBRSxRQUFRLEVBQUUsQ0FBQztZQUN6QixHQUFHLENBQUMsTUFBTSxHQUFHLEdBQUcsQ0FBQztZQUNqQixPQUFPLEVBQUUsS0FBSyxFQUFFLDZCQUE2QixJQUFJLENBQUMsWUFBWSxRQUFRLE1BQU0sQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQ3ZHLENBQUM7UUFFRCxNQUFNLEVBQUUsR0FBRyx1QkFBYSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUM7UUFDbEQsSUFBSSxDQUFDLEVBQUU7WUFBRSxNQUFNLElBQUksS0FBSyxDQUFDLGtDQUFrQyxDQUFDLENBQUM7UUFFN0QsTUFBTSxHQUFHLEdBQUcsTUFBTSxFQUFFLENBQUMsYUFBYSxDQUFDO1lBQ2pDLGFBQWEsRUFBRSxTQUFTLENBQUMsUUFBUSxDQUFDLEtBQUs7WUFDdkMsWUFBWSxFQUFFLFNBQVMsQ0FBQyxRQUFRLENBQUMsWUFBWTtZQUM3QyxXQUFXLEVBQUUsSUFBSSxDQUFDLFdBQVc7WUFDN0IsWUFBWSxFQUFFLFNBQVMsQ0FBQyxRQUFRLENBQUMsWUFBWTtTQUM5QyxDQUFDLENBQUM7UUFFSCxPQUFPLEVBQUUsR0FBRyxFQUFFLENBQUM7SUFDakIsQ0FBQztJQUVNLEtBQUssQ0FBQyxlQUFlLENBQUMsR0FBWTtRQUN2QyxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDO1FBQ3JDLE1BQU0sSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLElBQUksRUFBRSxDQUluQyxDQUFDO1FBQ0YsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFNBQVMsSUFBSSxJQUFJLENBQUMseUJBQXlCLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDeEUsTUFBTSxNQUFNLEdBQUcsZ0NBQWMsQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsUUFBUSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzNGLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNaLEdBQUcsQ0FBQyxNQUFNLEdBQUcsR0FBRyxDQUFDO1lBQ2pCLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSx3QkFBd0IsRUFBRSxDQUFDO1FBQzdELENBQUM7UUFDRCxJQUFJLENBQUM7WUFDSCxPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQzNDLE1BQU0sRUFBRSxHQUFHLHVCQUFhLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQztZQUNsRCxNQUFNLE1BQU0sQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDNUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQztRQUMzQixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDO1FBQ25DLENBQUM7SUFDSCxDQUFDO0lBRU0sS0FBSyxDQUFDLGdCQUFnQixDQUFDLEdBQVk7UUFDeEMsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQztRQUNyQyxNQUFNLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FJbkMsQ0FBQztRQUNGLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxTQUFTLElBQUksSUFBSSxDQUFDLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3hFLE1BQU0sTUFBTSxHQUFHLGdDQUFjLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUM1RixJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDWixHQUFHLENBQUMsTUFBTSxHQUFHLEdBQUcsQ0FBQztZQUNqQixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUseUJBQXlCLEVBQUUsQ0FBQztRQUM5RCxDQUFDO1FBQ0QsSUFBSSxDQUFDO1lBQ0gsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUM1QyxNQUFNLEVBQUUsR0FBRyx1QkFBYSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUM7WUFDbEQsTUFBTSxNQUFNLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQzNDLE9BQU8sRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUM7UUFDM0IsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsQ0FBQztRQUNuQyxDQUFDO0lBQ0gsQ0FBQztJQUVEOzs7T0FHRztJQUNPLHlCQUF5QixDQUFDLEdBQVk7UUFDOUMsTUFBTSxJQUFJLEdBQ1AsR0FBRyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsT0FBOEI7WUFDakQsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUF5QyxFQUFFLE9BQU8sQ0FBQztRQUNsRSxJQUFJLENBQUMsSUFBSTtZQUFFLE9BQU8sU0FBUyxDQUFDO1FBQzVCLE1BQU0sYUFBYSxHQUFHLHVDQUFrQixDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDdkYsT0FBTyxhQUFhLENBQUMsYUFBYSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDO0lBQ2hGLENBQUM7SUFFTSxTQUFTO1FBQ2QsT0FBTztZQUNMO2dCQUNFLElBQUksRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQztnQkFDbkMsTUFBTSxFQUFFLEtBQUs7Z0JBQ2IsUUFBUSxFQUFFLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFO2FBQ3JDO1lBQ0Q7Z0JBQ0UsSUFBSSxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDO2dCQUNoQyxNQUFNLEVBQUUsTUFBTTtnQkFDZCxRQUFRLEVBQUUsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDO2FBQ3JDO1lBQ0Q7Z0JBQ0UsSUFBSSxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsZUFBZSxDQUFDO2dCQUN0QyxNQUFNLEVBQUUsTUFBTTtnQkFDZCxRQUFRLEVBQUUsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDO2FBQzNDO1lBQ0Q7Z0JBQ0UsSUFBSSxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsaUJBQWlCLENBQUM7Z0JBQ3hDLE1BQU0sRUFBRSxNQUFNO2dCQUNkLFFBQVEsRUFBRSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLEdBQUcsQ0FBQzthQUNuRDtZQUNEO2dCQUNFLElBQUksRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDO2dCQUN6QyxNQUFNLEVBQUUsTUFBTTtnQkFDZCxRQUFRLEVBQUUsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxHQUFHLENBQUM7YUFDcEQ7WUFDRDtnQkFDRSxJQUFJLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUM7Z0JBQy9CLE1BQU0sRUFBRSxNQUFNO2dCQUNkLFFBQVEsRUFBRSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUM7YUFDcEM7WUFDRDtnQkFDRSxJQUFJLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUM7Z0JBQy9CLE1BQU0sRUFBRSxNQUFNO2dCQUNkLFFBQVEsRUFBRSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUM7YUFDcEM7WUFDRDtnQkFDRSxJQUFJLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUM7Z0JBQy9CLE1BQU0sRUFBRSxNQUFNO2dCQUNkLFFBQVEsRUFBRSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUM7YUFDcEM7WUFDRDtnQkFDRSxJQUFJLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxlQUFlLENBQUM7Z0JBQ3RDLE1BQU0sRUFBRSxNQUFNO2dCQUNkLFFBQVEsRUFBRSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUM7YUFDM0M7WUFDRDtnQkFDRSxJQUFJLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxjQUFjLENBQUM7Z0JBQ3JDLE1BQU0sRUFBRSxNQUFNO2dCQUNkLFFBQVEsRUFBRSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUM7YUFDN0M7WUFDRDtnQkFDRSxJQUFJLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxlQUFlLENBQUM7Z0JBQ3RDLE1BQU0sRUFBRSxNQUFNO2dCQUNkLFFBQVEsRUFBRSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQzthQUM5QztTQUNGLENBQUM7SUFDSixDQUFDO0NBQ0Y7QUE5Z0JELDhDQThnQkMifQ==