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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _ApprovalExecutor_instance;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApprovalExecutor = void 0;
const serverMounter_1 = __importDefault(require("../core/serverMounter"));
const approval_context_1 = require("./approval-context");
const approval_store_1 = require("./approval-store");
const webhook_engine_1 = require("./webhook-engine");
const hook_engine_1 = require("./hook-engine");
/**
 * Replays an APPROVED request using the original requester identity.
 * Bypasses the approval gate via ApprovalContext.isReplay.
 */
class ApprovalExecutor {
    static get instance() {
        if (!__classPrivateFieldGet(this, _a, "f", _ApprovalExecutor_instance))
            __classPrivateFieldSet(this, _a, new _a(), "f", _ApprovalExecutor_instance);
        return __classPrivateFieldGet(this, _a, "f", _ApprovalExecutor_instance);
    }
    async execute(requestId) {
        const store = approval_store_1.ApprovalStore.instance;
        const req = store.getRequest(requestId);
        if (!req)
            throw new Error(`Request ${requestId} not found`);
        if (req.status !== "APPROVED") {
            throw new Error(`Request ${requestId} is not APPROVED`);
        }
        // Re-check policy still exists & matches at replay time
        const policy = store.getPolicy(req.policyId);
        if (!policy) {
            const failed = store.markExecutionFailed(requestId, "Policy was removed before execution");
            return failed;
        }
        try {
            await approval_context_1.ApprovalContext.run({ requester: req.requester, isReplay: true }, async () => {
                await this.runAction(req.action);
            });
            return store.markExecuted(requestId);
        }
        catch (e) {
            const message = e?.message ?? String(e);
            return store.markExecutionFailed(requestId, message);
        }
    }
    async runAction(action) {
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
    async runCrud(table, op, payload) {
        const db = serverMounter_1.default.instance.databaseHandler;
        if (!db)
            throw new Error("Database handler not initialized");
        const tableName = table;
        const hooks = hook_engine_1.HookEngine.instance;
        if (op === "CREATE") {
            const data = payload;
            const before = await hooks.runBefore(tableName, "CREATE", data);
            const rows = await db.insert({ table, data: before });
            const after = await hooks.runAfter(tableName, "CREATE", rows);
            webhook_engine_1.WebhookEngine.instance.dispatch("CREATE", table, after).catch(() => { });
            return;
        }
        if (op === "UPDATE") {
            const body = payload;
            const before = await hooks.runBefore(tableName, "UPDATE", body);
            const rows = await db.update({
                table,
                data: before.patch,
                where: before.where,
            });
            const after = await hooks.runAfter(tableName, "UPDATE", rows);
            webhook_engine_1.WebhookEngine.instance.dispatch("UPDATE", table, after).catch(() => { });
            return;
        }
        if (op === "DELETE") {
            const records = (Array.isArray(payload) ? payload : []);
            if (!records.length)
                return;
            const before = (await hooks.runBefore(tableName, "DELETE", records));
            const schema = serverMounter_1.default.instance.schemaDetails;
            const tableMeta = schema.tables.find((t) => t.name === table);
            const primaryColumns = (tableMeta?.columns ?? [])
                .filter((c) => c.primary_key)
                .map((c) => c.name);
            const columnNames = new Set((tableMeta?.columns ?? []).map((c) => c.name));
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
            if (keyed.length) {
                const where = {};
                for (const col of primaryColumns) {
                    where[col] = keyed.map((r) => r[col]);
                }
                await db.delete({ table, where, single: false });
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
                await db.delete({ table, where, single: false });
            }
            const after = await hooks.runAfter(tableName, "DELETE", records);
            webhook_engine_1.WebhookEngine.instance.dispatch("DELETE", table, after).catch(() => { });
        }
    }
    async runAdvancedQuery(sql) {
        const db = serverMounter_1.default.instance.databaseHandler;
        if (!db)
            throw new Error("Database handler not initialized");
        await db.query({
            sql,
            schema: serverMounter_1.default.instance.config?.db?.schema,
        });
    }
}
exports.ApprovalExecutor = ApprovalExecutor;
_a = ApprovalExecutor;
_ApprovalExecutor_instance = { value: void 0 };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwcm92YWwtZXhlY3V0b3IuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvaW5jL3NlcnZpY2VzL2FwcHJvdmFsLWV4ZWN1dG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDBFQUFrRDtBQUNsRCx5REFBcUQ7QUFDckQscURBQWlEO0FBQ2pELHFEQUFpRDtBQU1qRCwrQ0FBMkM7QUFFM0M7OztHQUdHO0FBQ0gsTUFBYSxnQkFBZ0I7SUFFM0IsTUFBTSxLQUFLLFFBQVE7UUFDakIsSUFBSSxDQUFDLHVCQUFBLElBQUksc0NBQVU7WUFBRSx1QkFBQSxJQUFJLE1BQWEsSUFBSSxFQUFnQixFQUFFLGtDQUFBLENBQUM7UUFDN0QsT0FBTyx1QkFBQSxJQUFJLHNDQUFVLENBQUM7SUFDeEIsQ0FBQztJQUVELEtBQUssQ0FBQyxPQUFPLENBQUMsU0FBaUI7UUFDN0IsTUFBTSxLQUFLLEdBQUcsOEJBQWEsQ0FBQyxRQUFRLENBQUM7UUFDckMsTUFBTSxHQUFHLEdBQUcsS0FBSyxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN4QyxJQUFJLENBQUMsR0FBRztZQUFFLE1BQU0sSUFBSSxLQUFLLENBQUMsV0FBVyxTQUFTLFlBQVksQ0FBQyxDQUFDO1FBQzVELElBQUksR0FBRyxDQUFDLE1BQU0sS0FBSyxVQUFVLEVBQUUsQ0FBQztZQUM5QixNQUFNLElBQUksS0FBSyxDQUFDLFdBQVcsU0FBUyxrQkFBa0IsQ0FBQyxDQUFDO1FBQzFELENBQUM7UUFFRCx3REFBd0Q7UUFDeEQsTUFBTSxNQUFNLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDN0MsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ1osTUFBTSxNQUFNLEdBQUcsS0FBSyxDQUFDLG1CQUFtQixDQUN0QyxTQUFTLEVBQ1QscUNBQXFDLENBQ3RDLENBQUM7WUFDRixPQUFP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