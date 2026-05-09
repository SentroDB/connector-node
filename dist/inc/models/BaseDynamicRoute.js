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
        const db = serverMounter_1.default.instance.databaseHandler;
        if (!db)
            throw new Error("Database handler not initialized");
        const rows = await db.insert({
            table: String(this.baseModelName),
            data: before,
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
        const db = serverMounter_1.default.instance.databaseHandler;
        if (!db)
            throw new Error("Database handler not initialized");
        const rows = await db.update({
            table: String(this.baseModelName),
            data: before.patch,
            where: before.where
        });
        const after = await this.hooks.runAfter(this.baseModelName, "UPDATE", rows);
        webhook_engine_1.WebhookEngine.instance
            .dispatch("UPDATE", String(this.baseModelName), after)
            .catch((err) => console.error("[Webhook] dispatch error:", err));
        return after;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQmFzZUR5bmFtaWNSb3V0ZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9pbmMvbW9kZWxzL0Jhc2VEeW5hbWljUm91dGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQ0EsMEVBQWtEO0FBQ2xELG9FQUFpRTtBQUVqRSxrREFBK0Q7QUFHL0QsbUVBQWdFO0FBQ2hFLHlEQUFxRDtBQUNyRCxpRUFBNkQ7QUFDN0QsK0RBQTJEO0FBQzNELCtEQUFtRTtBQUNuRSwwREFBNkU7QUFFN0UsTUFBc0Isc0JBQXNCO0lBUTFDLFlBQVksYUFBd0M7UUFON0MsVUFBSyxHQUFHLHdCQUFVLENBQUMsUUFBUSxDQUFDO1FBT2pDLElBQUksQ0FBQyxhQUFhLEdBQUcsYUFBYSxDQUFDO1FBQ25DLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxpQ0FBZSxDQUFDLElBQUksQ0FBQyxhQUEwQyxDQUFDLENBQUM7SUFDekYsQ0FBQztJQUVNLFlBQVk7UUFDakIsT0FBTyxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztJQUMxQyxDQUFDO0lBRU0sVUFBVSxDQUFDLE9BQWU7UUFDL0IsT0FBTyxJQUFJLENBQUMsWUFBWSxFQUFFLEdBQUcsR0FBRyxHQUFHLE9BQU8sQ0FBQztJQUM3QyxDQUFDO0lBRVMsY0FBYztRQUN0QixNQUFNLElBQUksR0FBRyx1QkFBYSxDQUFDLFFBQVEsQ0FBQztRQUNwQyxJQUFJLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRSxNQUFNLEVBQUUsQ0FBQztZQUNqQyxNQUFNLElBQUksS0FBSyxDQUFDLGdEQUFnRCxDQUFDLENBQUM7UUFDcEUsQ0FBQztRQUNELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLElBQUksQ0FDMUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLGFBQWEsQ0FDckMsQ0FB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