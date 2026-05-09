"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouterManager = void 0;
const cors_1 = __importDefault(require("@koa/cors"));
const router_1 = __importDefault(require("@koa/router"));
const koa_bodyparser_1 = __importDefault(require("koa-bodyparser"));
const serverMounter_1 = __importDefault(require("../core/serverMounter"));
const BaseDynamicRoute_1 = require("../models/BaseDynamicRoute");
const customizationStore_1 = require("../core/customizationStore");
const webhook_store_1 = require("../services/webhook-store");
const webhook_logger_1 = require("../services/webhook-logger");
const webhook_engine_1 = require("../services/webhook-engine");
const viewsStore_1 = require("../core/viewsStore");
const approval_store_1 = require("../services/approval-store");
const approval_executor_1 = require("../services/approval-executor");
const approval_http_1 = require("../utils/approval-http");
class RouterManager {
    constructor() {
        this.serverMounter = serverMounter_1.default.instance;
        this.router = new router_1.default();
        this.router.use((0, koa_bodyparser_1.default)({ jsonLimit: "50mb" }));
        this.router.all("(.*)", (0, cors_1.default)({ credentials: true, maxAge: 24 * 3600, privateNetworkAccess: true }));
    }
    addRoute(route) {
        this.router[route.method](route.path, async (ctx, next) => {
            ctx.body = await route.callback(ctx);
            next();
        });
    }
    deepMerge(base, override) {
        // minimal deep merge good enough for customization objects
        if (!override)
            return base;
        if (Array.isArray(base))
            return override ?? base;
        if (typeof base !== "object" || base === null)
            return override ?? base;
        const out = { ...base };
        for (const k of Object.keys(override)) {
            const bv = base[k];
            const ov = override[k];
            if (ov && typeof ov === "object" && !Array.isArray(ov)) {
                out[k] = this.deepMerge(bv ?? {}, ov);
            }
            else {
                out[k] = ov;
            }
        }
        return out;
    }
    applyCustomizations(base) {
        const store = customizationStore_1.CustomizationStore.instance.getAll();
        const result = {
            ...base,
            tables: base.tables.map((t) => {
                const tableOverride = store.find((c) => c.name === t.name)?.customization;
                let mergedTableCustomization = this.deepMerge(t.customization ?? {}, tableOverride ?? {});
                const columns = t.columns.map((c) => {
                    const colOverride = store
                        .find((tt) => tt.name === t.name)
                        ?.columns.find((cc) => cc.name === c.name)?.customization;
                    const mergedColCustomization = this.deepMerge(c.customization ?? {}, colOverride ?? {});
                    return {
                        ...c,
                        customization: mergedColCustomization,
                    };
                });
                return {
                    ...t,
                    columns,
                    customization: mergedTableCustomization,
                };
            }),
        };
        return result;
    }
    getSchema(ctx) {
        const base = serverMounter_1.default.instance?.schemaDetails;
        if (!base) {
            ctx.status = 500;
            ctx.body = { error: "Server not initialized: schemaDetails missing" };
            return;
        }
        const merged = this.applyCustomizations(base);
        return merged;
    }
    generateDefaultRoutes() {
        const DEFAULT_ROUTES = [
            {
                path: "/",
                method: "get",
                callback: () => {
                    return { message: "Hello World" };
                },
            },
            {
                path: "/ping",
                method: "get",
                callback: () => {
                    return { message: "pong" };
                },
            },
            {
                path: "/health",
                method: "get",
                callback: () => {
                    const dbHandler = this.serverMounter.databaseHandler;
                    const isDbConnected = !!dbHandler;
                    return {
                        status: isDbConnected ? "healthy" : "degraded",
                        server: true,
                        database: isDbConnected,
                        timestamp: new Date().toISOString(),
                    };
                },
            },
            {
                path: "/getSchema",
                method: "get",
                callback: (ctx) => {
                    return this.getSchema(ctx);
                },
            },
            {
                path: "/validate",
                method: "post",
                callback: (ctx) => {
                    const { key } = ctx.request.body;
                    return { isValid: key === this.serverMounter.config?.secretKey };
                },
            },
            {
                path: "/execute",
                method: "post",
                callback: async (ctx) => {
                    const { query, params } = ctx.request.body;
                    if (!query || typeof query !== "string") {
                        ctx.status = 400;
                        return { error: 'Missing or invalid "query" field' };
                    }
                    try {
                        (0, approval_http_1.requireApproval)(ctx, {
                            kind: "ADVANCED_QUERY",
                            sql: query,
                            projectDbId: this.serverMounter.config?.db?.database ?? "default",
                        });
                    }
                    catch (e) {
                        if (e instanceof approval_store_1.ApprovalRequiredError) {
                            return (0, approval_http_1.respondWithPending)(ctx, e);
                        }
                        throw e;
                    }
                    const dbHandler = this.serverMounter.databaseHandler;
                    if (!dbHandler) {
                        ctx.status = 503;
                        return { error: "Database handler is not available" };
                    }
                    try {
                        const schema = this.serverMounter.schemaDetails;
                        const identifiers = new Set();
                        for (const table of schema?.tables ?? []) {
                            identifiers.add(table.name);
                            for (const col of table.columns) {
                                identifiers.add(col.name);
                            }
                        }
                        let processedQuery = query;
                        for (const name of identifiers) {
                            const regex = new RegExp(`["'\`]?\\b${name}\\b["'\`]?`, "g");
                            processedQuery = processedQuery.replace(regex, `"${name}"`);
                        }
                        const result = await dbHandler.query({
                            sql: processedQuery,
                            params,
                            schema: this.serverMounter.config?.db?.schema,
                        });
                        return result;
                    }
                    catch (err) {
                        ctx.status = 400;
                        return { error: err.message };
                    }
                },
            },
        ];
        DEFAULT_ROUTES.forEach((route) => {
            this.addRoute(route);
        });
    }
    generateRoutesFromSchema() {
        this.serverMounter.schemaDetails.tables.forEach((table) => {
            const dynamicRoute = new BaseDynamicRoute_1.DynamicModelRoute(table.name);
            dynamicRoute.getRoutes().forEach((route) => {
                this.addRoute(route);
            });
        });
    }
    generateWebhookRoutes() {
        const webhookRoutes = [
            {
                path: "/webhooks",
                method: "get",
                callback: () => webhook_store_1.WebhookStore.instance.getAll(),
            },
            {
                path: "/webhooks/:id",
                method: "get",
                callback: (ctx) => {
                    const webhook = webhook_store_1.WebhookStore.instance.get(ctx.params.id);
                    if (!webhook) {
                        ctx.status = 404;
                        return { error: "Webhook not found" };
                    }
                    return webhook;
                },
            },
            {
                path: "/webhooks",
                method: "post",
                callback: (ctx) => {
                    const dto = ctx.request.body;
                    const webhook = webhook_store_1.WebhookStore.instance.add(dto);
                    ctx.status = 201;
                    return webhook;
                },
            },
            {
                path: "/webhooks/:id",
                method: "put",
                callback: (ctx) => {
                    const dto = ctx.request.body;
                    try {
                        return webhook_store_1.WebhookStore.instance.update(ctx.params.id, dto);
                    }
                    catch {
                        ctx.status = 404;
                        return { error: "Webhook not found" };
                    }
                },
            },
            {
                path: "/webhooks/:id",
                method: "delete",
                callback: (ctx) => {
                    const deleted = webhook_store_1.WebhookStore.instance.remove(ctx.params.id);
                    if (!deleted) {
                        ctx.status = 404;
                        return { error: "Webhook not found" };
                    }
                    return { success: true };
                },
            },
            {
                path: "/webhooks/:id/logs",
                method: "get",
                callback: (ctx) => {
                    const limit = Number(ctx.query.limit) || 20;
                    const offset = Number(ctx.query.offset) || 0;
                    return webhook_logger_1.WebhookLogger.instance.getByWebhookId(ctx.params.id, {
                        limit,
                        offset,
                    });
                },
            },
            {
                path: "/webhooks/:webhookId/logs/:logId/resend",
                method: "post",
                callback: async (ctx) => {
                    try {
                        await webhook_engine_1.WebhookEngine.instance.resend(ctx.params.logId);
                        return { success: true };
                    }
                    catch (err) {
                        ctx.status = 404;
                        return { error: err.message };
                    }
                },
            },
        ];
        webhookRoutes.forEach((route) => this.addRoute(route));
    }
    generateApprovalRoutes() {
        const approvalRoutes = [
            // ─── Policies ───
            {
                path: "/approvals/policies",
                method: "get",
                callback: () => approval_store_1.ApprovalStore.instance.listPolicies(),
            },
            {
                path: "/approvals/policies/:id",
                method: "get",
                callback: (ctx) => {
                    const policy = approval_store_1.ApprovalStore.instance.getPolicy(ctx.params.id);
                    if (!policy) {
                        ctx.status = 404;
                        return { error: "Policy not found" };
                    }
                    return policy;
                },
            },
            {
                path: "/approvals/policies",
                method: "post",
                callback: (ctx) => {
                    const dto = ctx.request.body;
                    if (!dto?.name) {
                        ctx.status = 400;
                        return { error: "Missing name" };
                    }
                    const created = approval_store_1.ApprovalStore.instance.addPolicy(dto);
                    ctx.status = 201;
                    return created;
                },
            },
            {
                path: "/approvals/policies/:id",
                method: "patch",
                callback: (ctx) => {
                    const dto = ctx.request.body;
                    try {
                        return approval_store_1.ApprovalStore.instance.updatePolicy(ctx.params.id, dto);
                    }
                    catch {
                        ctx.status = 404;
                        return { error: "Policy not found" };
                    }
                },
            },
            {
                path: "/approvals/policies/:id",
                method: "put",
                callback: (ctx) => {
                    const dto = ctx.request.body;
                    try {
                        return approval_store_1.ApprovalStore.instance.updatePolicy(ctx.params.id, dto);
                    }
                    catch {
                        ctx.status = 404;
                        return { error: "Policy not found" };
                    }
                },
            },
            {
                path: "/approvals/policies/:id",
                method: "delete",
                callback: (ctx) => {
                    const deleted = approval_store_1.ApprovalStore.instance.removePolicy(ctx.params.id);
                    if (!deleted) {
                        ctx.status = 404;
                        return { error: "Policy not found" };
                    }
                    return { success: true };
                },
            },
            // ─── Requests ───
            {
                path: "/approvals/requests",
                method: "get",
                callback: (ctx) => {
                    const status = ctx.query.status;
                    const mine = ctx.query.mine === "true";
                    const awaitingMyDecision = ctx.query.awaitingMyDecision === "true";
                    const requester = (0, approval_http_1.extractRequester)(ctx);
                    let requests = approval_store_1.ApprovalStore.instance.listRequests({ status });
                    if (mine && requester) {
                        requests = requests.filter((r) => r.requester.userId === requester.userId);
                    }
                    if (awaitingMyDecision && requester) {
                        requests = requests.filter((r) => {
                            if (r.status !== "PENDING")
                                return false;
                            const policy = approval_store_1.ApprovalStore.instance.getPolicy(r.policyId);
                            if (!policy)
                                return false;
                            if (!policy.approvers.allowSelfApproval &&
                                requester.userId === r.requester.userId) {
                                return false;
                            }
                            if (r.decisions.some((d) => d.userId === requester.userId)) {
                                return false;
                            }
                            return approval_store_1.ApprovalStore.instance.userIsAuthorized({ userId: requester.userId, roles: requester.roles }, policy);
                        });
                    }
                    return requests;
                },
            },
            {
                path: "/approvals/requests/:id",
                method: "get",
                callback: (ctx) => {
                    const req = approval_store_1.ApprovalStore.instance.getRequest(ctx.params.id);
                    if (!req) {
                        ctx.status = 404;
                        return { error: "Request not found" };
                    }
                    return req;
                },
            },
            {
                path: "/approvals/requests/:id/approve",
                method: "post",
                callback: async (ctx) => {
                    const requester = (0, approval_http_1.extractRequester)(ctx);
                    if (!requester) {
                        ctx.status = 401;
                        return { error: "Missing user identity" };
                    }
                    const dto = (ctx.request.body ?? {});
                    try {
                        const updated = await approval_store_1.ApprovalStore.instance.decide(ctx.params.id, {
                            userId: requester.userId,
                            userEmail: requester.email,
                            roles: requester.roles,
                        }, "APPROVE", dto);
                        if (updated.status === "APPROVED") {
                            approval_executor_1.ApprovalExecutor.instance
                                .execute(updated.id)
                                .catch((err) => console.error("[Approvals] Execute failed", err));
                        }
                        return updated;
                    }
                    catch (err) {
                        ctx.status = 400;
                        return { error: err.message };
                    }
                },
            },
            {
                path: "/approvals/requests/:id/reject",
                method: "post",
                callback: async (ctx) => {
                    const requester = (0, approval_http_1.extractRequester)(ctx);
                    if (!requester) {
                        ctx.status = 401;
                        return { error: "Missing user identity" };
                    }
                    const dto = (ctx.request.body ?? {});
                    try {
                        return await approval_store_1.ApprovalStore.instance.decide(ctx.params.id, {
                            userId: requester.userId,
                            userEmail: requester.email,
                            roles: requester.roles,
                        }, "REJECT", dto);
                    }
                    catch (err) {
                        ctx.status = 400;
                        return { error: err.message };
                    }
                },
            },
            {
                path: "/approvals/requests/:id/cancel",
                method: "post",
                callback: (ctx) => {
                    const requester = (0, approval_http_1.extractRequester)(ctx);
                    if (!requester) {
                        ctx.status = 401;
                        return { error: "Missing user identity" };
                    }
                    try {
                        return approval_store_1.ApprovalStore.instance.cancel(ctx.params.id, {
                            userId: requester.userId,
                        });
                    }
                    catch (err) {
                        ctx.status = 400;
                        return { error: err.message };
                    }
                },
            },
            {
                path: "/approvals/requests/:id/comments",
                method: "post",
                callback: (ctx) => {
                    const requester = (0, approval_http_1.extractRequester)(ctx);
                    if (!requester) {
                        ctx.status = 401;
                        return { error: "Missing user identity" };
                    }
                    const dto = ctx.request.body;
                    if (!dto?.body || typeof dto.body !== "string") {
                        ctx.status = 400;
                        return { error: "Missing comment body" };
                    }
                    try {
                        return approval_store_1.ApprovalStore.instance.addComment(ctx.params.id, { userId: requester.userId, userEmail: requester.email }, dto);
                    }
                    catch (err) {
                        ctx.status = 404;
                        return { error: err.message };
                    }
                },
            },
            {
                path: "/approvals/requests/:id/retry",
                method: "post",
                callback: async (ctx) => {
                    const req = approval_store_1.ApprovalStore.instance.getRequest(ctx.params.id);
                    if (!req) {
                        ctx.status = 404;
                        return { error: "Request not found" };
                    }
                    if (req.status !== "EXECUTION_FAILED") {
                        ctx.status = 400;
                        return {
                            error: `Request is not in EXECUTION_FAILED state (current: ${req.status})`,
                        };
                    }
                    // Promote back to APPROVED so executor will re-run.
                    req.status = "APPROVED";
                    req.executionError = null;
                    req.updatedAt = new Date().toISOString();
                    approval_executor_1.ApprovalExecutor.instance
                        .execute(req.id)
                        .catch((err) => console.error("[Approvals] Retry execute failed", err));
                    return approval_store_1.ApprovalStore.instance.getRequest(req.id);
                },
            },
        ];
        approvalRoutes.forEach((route) => this.addRoute(route));
    }
    generateViewRoutes() {
        const viewRoutes = [
            {
                path: "/views",
                method: "get",
                callback: () => viewsStore_1.ViewsStore.instance.list(),
            },
            {
                path: "/views/:slug",
                method: "get",
                callback: (ctx) => {
                    const view = viewsStore_1.ViewsStore.instance.get(ctx.params.slug);
                    if (!view) {
                        ctx.status = 404;
                        return { error: "View not found" };
                    }
                    return view;
                },
            },
            {
                path: "/views",
                method: "post",
                callback: (ctx) => {
                    const dto = ctx.request.body;
                    if (!dto?.slug || !dto?.name || !dto?.engine) {
                        ctx.status = 400;
                        return { error: "Missing slug, name, or engine" };
                    }
                    try {
                        const view = viewsStore_1.ViewsStore.instance.create(dto);
                        ctx.status = 201;
                        return view;
                    }
                    catch (err) {
                        ctx.status = err.status ?? 500;
                        return { error: err.message };
                    }
                },
            },
            {
                path: "/views/:slug",
                method: "put",
                callback: (ctx) => {
                    const dto = ctx.request.body;
                    try {
                        return viewsStore_1.ViewsStore.instance.update(ctx.params.slug, dto);
                    }
                    catch (err) {
                        ctx.status = err.status ?? 500;
                        return { error: err.message };
                    }
                },
            },
            {
                path: "/views/:slug",
                method: "delete",
                callback: (ctx) => {
                    const deleted = viewsStore_1.ViewsStore.instance.delete(ctx.params.slug);
                    if (!deleted) {
                        ctx.status = 404;
                        return { error: "View not found" };
                    }
                    return { success: true };
                },
            },
        ];
        viewRoutes.forEach((route) => this.addRoute(route));
    }
}
exports.RouterManager = RouterManager;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2luYy9yb3V0ZXIvcm91dGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLHFEQUE2QjtBQUM3Qix5REFBaUM7QUFDakMsb0VBQXdDO0FBQ3hDLDBFQUFrRDtBQUVsRCxpRUFBK0Q7QUFFL0QsbUVBQWdFO0FBRWhFLDZEQUF5RDtBQUN6RCwrREFBMkQ7QUFDM0QsK0RBQTJEO0FBRTNELG1EQUFnRDtBQUVoRCwrREFBa0Y7QUFDbEYscUVBQWlFO0FBQ2pFLDBEQUlnQztBQVFoQyxNQUFhLGFBQWE7SUFJeEI7UUFGTyxrQkFBYSxHQUFrQix1QkFBYSxDQUFDLFFBQVEsQ0FBQztRQUczRCxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksZ0JBQU0sRUFBRSxDQUFDO1FBQzNCLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUEsd0JBQVUsRUFBQyxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbkQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQ2IsTUFBTSxFQUNOLElBQUEsY0FBSSxFQUFDLEVBQUUsV0FBVyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsRUFBRSxHQUFHLElBQUksRUFBRSxvQkFBb0IsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUMzRSxDQUFDO0lBQ0osQ0FBQztJQUVELFFBQVEsQ0FBQyxLQUFZO1FBQ25CLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsRUFBRTtZQUN4RCxHQUFHLENBQUMsSUFBSSxHQUFHLE1BQU0sS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNyQyxJQUFJLEVBQUUsQ0FBQztRQUNULENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJ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