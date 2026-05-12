"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouterManager = void 0;
const cors_1 = __importDefault(require("@koa/cors"));
const router_1 = __importDefault(require("@koa/router"));
const crypto_1 = require("crypto");
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
const requireJwtAuth_1 = require("./requireJwtAuth");
class RouterManager {
    constructor() {
        this.serverMounter = serverMounter_1.default.instance;
        this.router = new router_1.default();
        this.router.use((0, koa_bodyparser_1.default)({ jsonLimit: "50mb" }));
        this.router.all("(.*)", (0, cors_1.default)({ credentials: true, maxAge: 24 * 3600, privateNetworkAccess: true }));
        this.router.use(async (ctx, next) => {
            if (ctx.path === "/validate" || ctx.path === "/health") {
                return next();
            }
            const secret = this.serverMounter.config?.secretKey;
            if (!secret) {
                ctx.status = 503;
                ctx.body = { error: "service_unavailable", reason: "no_secret_configured" };
                return;
            }
            return (0, requireJwtAuth_1.requireJwtAuth)(secret)(ctx, next);
        });
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
                    const expected = this.serverMounter.config?.secretKey;
                    if (typeof key !== "string" || !expected) {
                        return { isValid: false };
                    }
                    const keyBuf = Buffer.from(key);
                    const expectedBuf = Buffer.from(expected);
                    if (keyBuf.length !== expectedBuf.length) {
                        return { isValid: false };
                    }
                    return { isValid: (0, crypto_1.timingSafeEqual)(keyBuf, expectedBuf) };
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2luYy9yb3V0ZXIvcm91dGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLHFEQUE2QjtBQUM3Qix5REFBaUM7QUFDakMsbUNBQXlDO0FBQ3pDLG9FQUF3QztBQUN4QywwRUFBa0Q7QUFFbEQsaUVBQStEO0FBRS9ELG1FQUFnRTtBQUVoRSw2REFBeUQ7QUFDekQsK0RBQTJEO0FBQzNELCtEQUEyRDtBQUUzRCxtREFBZ0Q7QUFFaEQsK0RBQWtGO0FBQ2xGLHFFQUFpRTtBQUNqRSwwREFJZ0M7QUFPaEMscURBQWtEO0FBRWxELE1BQWEsYUFBYTtJQUl4QjtRQUZPLGtCQUFhLEdBQWtCLHVCQUFhLENBQUMsUUFBUSxDQUFDO1FBRzNELElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxnQkFBTSxFQUFFLENBQUM7UUFDM0IsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBQSx3QkFBVSxFQUFDLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNuRCxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FDYixNQUFNLEVBQ04sSUFBQSxjQUFJLEVBQUMsRUFBRSxXQUFXLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxFQUFFLEdBQUcsSUFBSSxFQUFFLG9CQUFvQixFQUFFLElBQUksRUFBRSxDQUFDLENBQzNFLENBQUM7UUFDRixJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxFQUFFO1lBQ2xDLElBQUksR0FBRyxDQUFDLElBQUksS0FBSyxXQUFXLElBQUksR0FBRyxDQUFDLElBQUksS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDdkQsT0FBTyxJQUFJLEVBQUUsQ0FBQztZQUNoQixDQUFDO1lBQ0QsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFN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