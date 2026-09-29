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
const write_guards_1 = require("../utils/write-guards");
const record_deleter_1 = require("../services/record-deleter");
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
        const schemaTable = this.getSchemaTable();
        (0, write_guards_1.assertValidWhere)(schemaTable, where, "read", { required: false });
        (0, write_guards_1.assertValidConditions)(schemaTable, combinedConditions);
        if (before.columns !== undefined && before.columns !== null) {
            if (!Array.isArray(before.columns)) {
                throw new write_guards_1.RequestValidationError("`columns` must be an array.");
            }
            (0, write_guards_1.assertKnownColumns)(schemaTable, before.columns, "columns", (0, write_guards_1.getPhysicalColumnNames)(schemaTable));
        }
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
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            throw new write_guards_1.RequestValidationError("Insert payload must be an object.");
        }
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
        (0, write_guards_1.assertKnownColumns)(this.getSchemaTable(), Object.keys(written), "insert payload");
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
        // Reject unkeyed / key-less requests before they can be queued or run.
        (0, write_guards_1.buildPrimaryKeyWheres)(this.getSchemaTable(), records);
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
        const db = serverMounter_1.default.instance.databaseHandler;
        if (!db)
            throw new Error("Database handler not initialized");
        await (0, record_deleter_1.deleteRecordsByPrimaryKey)(db, this.getSchemaTable(), before);
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
        (0, write_guards_1.assertValidWhere)(this.getSchemaTable(), before.where, "update", {
            required: true,
        });
        const patch = await this.hooks.applyFieldWriters(this.baseModelName, "UPDATE", (before.patch ?? {}));
        const db = serverMounter_1.default.instance.databaseHandler;
        if (!db)
            throw new Error("Database handler not initialized");
        (0, write_guards_1.assertKnownColumns)(this.getSchemaTable(), Object.keys(patch), "update payload");
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
    /** Map client errors raised by the request guards to a 400 response. */
    guarded(routes) {
        return routes.map((route) => ({
            ...route,
            callback: async (ctx) => {
                try {
                    return await route.callback(ctx);
                }
                catch (e) {
                    if (e instanceof write_guards_1.RequestValidationError) {
                        ctx.status = e.status;
                        return { error: e.message };
                    }
                    throw e;
                }
            },
        }));
    }
    getRoutes() {
        return this.guarded([
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
        ]);
    }
}
exports.DynamicModelRoute = DynamicModelRoute;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQmFzZUR5bmFtaWNSb3V0ZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9pbmMvbW9kZWxzL0Jhc2VEeW5hbWljUm91dGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQ0EsMEVBQWtEO0FBQ2xELG9FQUFpRTtBQUVqRSxrREFBK0Q7QUFHL0QsbUVBQWdFO0FBQ2hFLHlEQUFxRDtBQUNyRCxpRUFBNkQ7QUFDN0QsK0RBQTJEO0FBQzNELCtEQUFtRTtBQUNuRSwwREFBNkU7QUFFN0Usd0RBTytCO0FBQy9CLCtEQUF1RTtBQUV2RTs7Ozs7Ozs7OztHQVVHO0FBQ0gsU0FBUyxlQUFlLENBQ3RCLEtBQTJCLEVBQzNCLE9BQTRCO0lBRTVCLE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQyxRQUFRLElBQUksQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ3ZGLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDdkIsT0FBTyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLEVBQUUsRUFBRSxDQUFDO0lBQzFDLENBQUM7SUFFRCxNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxFQUFFLElBQUksQ0FBQztJQUNoRSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDZCxrRkFBa0Y7UUFDbEYsTUFBTSxJQUFJLEdBQXdCLEVBQUUsQ0FBQztRQUNyQyxNQUFNLFFBQVEsR0FBRyxJQUFJLEdBQUcsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUN4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