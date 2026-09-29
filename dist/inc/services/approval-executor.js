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
const record_deleter_1 = require("./record-deleter");
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
            const written = await hooks.applyFieldWriters(tableName, "CREATE", before);
            const rows = await db.insert({ table, data: written });
            const after = await hooks.runAfter(tableName, "CREATE", rows);
            webhook_engine_1.WebhookEngine.instance.dispatch("CREATE", table, after).catch(() => { });
            return;
        }
        if (op === "UPDATE") {
            const body = payload;
            const before = await hooks.runBefore(tableName, "UPDATE", body);
            const patch = await hooks.applyFieldWriters(tableName, "UPDATE", (before.patch ?? {}));
            const rows = await db.update({
                table,
                data: patch,
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
            const tableMeta = serverMounter_1.default.instance.schemaDetails.tables.find((t) => t.name === table);
            if (!tableMeta)
                throw new Error("Table not found in schema: " + table);
            await (0, record_deleter_1.deleteRecordsByPrimaryKey)(db, tableMeta, before);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwcm92YWwtZXhlY3V0b3IuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvaW5jL3NlcnZpY2VzL2FwcHJvdmFsLWV4ZWN1dG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDBFQUFrRDtBQUNsRCx5REFBcUQ7QUFDckQscURBQWlEO0FBQ2pELHFEQUFpRDtBQU1qRCwrQ0FBMkM7QUFDM0MscURBQTZEO0FBRTdEOzs7R0FHRztBQUNILE1BQWEsZ0JBQWdCO0lBRTNCLE1BQU0sS0FBSyxRQUFRO1FBQ2pCLElBQUksQ0FBQyx1QkFBQSxJQUFJLHNDQUFVO1lBQUUsdUJBQUEsSUFBSSxNQUFhLElBQUksRUFBZ0IsRUFBRSxrQ0FBQSxDQUFDO1FBQzdELE9BQU8sdUJBQUEsSUFBSSxzQ0FBVSxDQUFDO0lBQ3hCLENBQUM7SUFFRCxLQUFLLENBQUMsT0FBTyxDQUFDLFNBQWlCO1FBQzdCLE1BQU0sS0FBSyxHQUFHLDhCQUFhLENBQUMsUUFBUSxDQUFDO1FBQ3JDLE1BQU0sR0FBRyxHQUFHLEtBQUssQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDeEMsSUFBSSxDQUFDLEdBQUc7WUFBRSxNQUFNLElBQUksS0FBSyxDQUFDLFdBQVcsU0FBUyxZQUFZLENBQUMsQ0FBQztRQUM1RCxJQUFJLEdBQUcsQ0FBQyxNQUFNLEtBQUssVUFBVSxFQUFFLENBQUM7WUFDOUIsTUFBTSxJQUFJLEtBQUssQ0FBQyxXQUFXLFNBQVMsa0JBQWtCLENBQUMsQ0FBQztRQUMxRCxDQUFDO1FBRUQsd0RBQXdEO1FBQ3hELE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzdDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNaLE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxtQkFBbUIsQ0FDdEMsU0FBUyxFQUNULHFDQUFxQyxDQUN0QyxD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