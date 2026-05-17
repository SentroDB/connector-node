import cors from "@koa/cors";
import Router from "@koa/router";
import { timingSafeEqual } from "crypto";
import bodyParser from "koa-bodyparser";
import ServerMounter from "../core/serverMounter";
import { Route } from "../types/global";
import { DynamicModelRoute } from "../models/BaseDynamicRoute";
import { CustomColumn, CustomTable, SchemaDetails } from "@sentrodb/connector-node-types";
import { CustomizationStore } from "../core/customizationStore";
import { Context } from "koa";
import { WebhookStore } from "../services/webhook-store";
import { WebhookLogger } from "../services/webhook-logger";
import { WebhookEngine } from "../services/webhook-engine";
import type { CreateWebhookDto, UpdateWebhookDto } from "../types/webhook";
import { ViewsStore } from "../core/viewsStore";
import type { ViewConfig } from "@sentrodb/connector-node-types";
import { ApprovalStore, ApprovalRequiredError } from "../services/approval-store";
import { ApprovalExecutor } from "../services/approval-executor";
import {
  extractRequester,
  requireApproval,
  respondWithPending,
} from "../utils/approval-http";
import type {
  ApprovalCommentDto,
  ApprovalDecisionDto,
  CreateApprovalPolicyDto,
  UpdateApprovalPolicyDto,
} from "../types/approval";
import { requireJwtAuth } from "./requireJwtAuth";

export class RouterManager {
  public router: Router;
  public serverMounter: ServerMounter = ServerMounter.instance;

  constructor() {
    this.router = new Router();
    this.router.use(bodyParser({ jsonLimit: "50mb" }));
    this.router.all(
      "(.*)",
      cors({ credentials: true, maxAge: 24 * 3600, privateNetworkAccess: true })
    );
    this.router.use(async (ctx, next) => {
      console.log(ctx.path);
      if (ctx.path === "/validate" || ctx.path === "/health") {
        return next();
      }
      const secret = this.serverMounter.config?.secretKey;
      if (!secret) {
        ctx.status = 503;
        ctx.body = { error: "service_unavailable", reason: "no_secret_configured" };
        return;
      }
      return requireJwtAuth(secret)(ctx, next);
    });
  }

  addRoute(route: Route) {
    this.router[route.method](route.path, async (ctx, next) => {
      ctx.body = await route.callback(ctx);
      next();
    });
  }

  private deepMerge<T>(base: T, override: Partial<T>): T {
    // minimal deep merge good enough for customization objects
    if (!override) return base as T;
    if (Array.isArray(base)) return (override as any) ?? base;
    if (typeof base !== "object" || base === null)
      return (override as any) ?? base;

    const out: any = { ...(base as any) };
    for (const k of Object.keys(override)) {
      const bv: any = (base as any)[k];
      const ov: any = (override as any)[k];
      if (ov && typeof ov === "object" && !Array.isArray(ov)) {
        out[k] = this.deepMerge(bv ?? {}, ov);
      } else {
        out[k] = ov;
      }
    }
    return out;
  }

  private applyCustomizations(base: SchemaDetails): SchemaDetails {
    const store = CustomizationStore.instance.getAll();

    const result: SchemaDetails = {
      ...base,
      tables: base.tables.map((t) => {
        const tableOverride = store.find(
          (c) => c.name === t.name
        )?.customization;
        let mergedTableCustomization: CustomTable = this.deepMerge(
          t.customization ?? {},
          tableOverride ?? {}
        );

        const columns = t.columns.map((c) => {
          const colOverride = store
            .find((tt) => tt.name === t.name)
            ?.columns.find((cc) => cc.name === c.name)?.customization;
          const mergedColCustomization: CustomColumn = this.deepMerge(
            c.customization ?? {},
            colOverride ?? {}
          );
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

  private getSchema(ctx: Context) {
    const base = ServerMounter.instance?.schemaDetails;
    if (!base) {
      ctx.status = 500;
      ctx.body = { error: "Server not initialized: schemaDetails missing" };
      return;
    }

    const merged = this.applyCustomizations(base);

    return merged;
  }

  generateDefaultRoutes() {
    const DEFAULT_ROUTES: Route[] = [
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
          const { key } = ctx.request.body as { key: string };
          const expected = this.serverMounter.config?.secretKey;
          if (typeof key !== "string" || !expected) {
            return { isValid: false };
          }
          const keyBuf = Buffer.from(key);
          const expectedBuf = Buffer.from(expected);
          if (keyBuf.length !== expectedBuf.length) {
            return { isValid: false };
          }
          return { isValid: timingSafeEqual(keyBuf, expectedBuf) };
        },
      },
      {
        path: "/execute",
        method: "post",
        callback: async (ctx) => {
          const { query, params } = ctx.request.body as {
            query: string;
            params?: any[];
          };

          if (!query || typeof query !== "string") {
            ctx.status = 400;
            return { error: 'Missing or invalid "query" field' };
          }

          try {
            requireApproval(ctx, {
              kind: "ADVANCED_QUERY",
              sql: query,
              projectDbId:
                this.serverMounter.config?.db?.database ?? "default",
            });
          } catch (e) {
            if (e instanceof ApprovalRequiredError) {
              return respondWithPending(ctx, e);
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
            const identifiers = new Set<string>();
            for (const table of schema?.tables ?? []) {
              identifiers.add(table.name);
              for (const col of table.columns) {
                identifiers.add(col.name);
              }
            }

            let processedQuery = query;
            for (const name of identifiers) {
              const regex = new RegExp(
                `["'\`]?\\b${name}\\b["'\`]?`,
                "g"
              );
              processedQuery = processedQuery.replace(regex, `"${name}"`);
            }

            const result = await dbHandler.query({
              sql: processedQuery,
              params,
              schema: this.serverMounter.config?.db?.schema,
            });
            return result;
          } catch (err: any) {
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
      const dynamicRoute = new DynamicModelRoute(
        table.name as DBManagerSchema.TableName
      );
      dynamicRoute.getRoutes().forEach((route) => {
        this.addRoute(route);
      });
    });
  }

  generateWebhookRoutes() {
    const webhookRoutes: Route[] = [
      {
        path: "/webhooks",
        method: "get",
        callback: () => WebhookStore.instance.getAll(),
      },
      {
        path: "/webhooks/:id",
        method: "get",
        callback: (ctx) => {
          const webhook = WebhookStore.instance.get(ctx.params.id);
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
          const dto = ctx.request.body as CreateWebhookDto;
          const webhook = WebhookStore.instance.add(dto);
          ctx.status = 201;
          return webhook;
        },
      },
      {
        path: "/webhooks/:id",
        method: "put",
        callback: (ctx) => {
          const dto = ctx.request.body as UpdateWebhookDto;
          try {
            return WebhookStore.instance.update(ctx.params.id, dto);
          } catch {
            ctx.status = 404;
            return { error: "Webhook not found" };
          }
        },
      },
      {
        path: "/webhooks/:id",
        method: "delete",
        callback: (ctx) => {
          const deleted = WebhookStore.instance.remove(ctx.params.id);
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
          return WebhookLogger.instance.getByWebhookId(ctx.params.id, {
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
            await WebhookEngine.instance.resend(ctx.params.logId);
            return { success: true };
          } catch (err: any) {
            ctx.status = 404;
            return { error: err.message };
          }
        },
      },
    ];

    webhookRoutes.forEach((route) => this.addRoute(route));
  }

  generateApprovalRoutes() {
    const approvalRoutes: Route[] = [
      // ─── Policies ───
      {
        path: "/approvals/policies",
        method: "get",
        callback: () => ApprovalStore.instance.listPolicies(),
      },
      {
        path: "/approvals/policies/:id",
        method: "get",
        callback: (ctx) => {
          const policy = ApprovalStore.instance.getPolicy(ctx.params.id);
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
          const dto = ctx.request.body as CreateApprovalPolicyDto;
          if (!dto?.name) {
            ctx.status = 400;
            return { error: "Missing name" };
          }
          const created = ApprovalStore.instance.addPolicy(dto);
          ctx.status = 201;
          return created;
        },
      },
      {
        path: "/approvals/policies/:id",
        method: "patch",
        callback: (ctx) => {
          const dto = ctx.request.body as UpdateApprovalPolicyDto;
          try {
            return ApprovalStore.instance.updatePolicy(ctx.params.id, dto);
          } catch {
            ctx.status = 404;
            return { error: "Policy not found" };
          }
        },
      },
      {
        path: "/approvals/policies/:id",
        method: "put",
        callback: (ctx) => {
          const dto = ctx.request.body as UpdateApprovalPolicyDto;
          try {
            return ApprovalStore.instance.updatePolicy(ctx.params.id, dto);
          } catch {
            ctx.status = 404;
            return { error: "Policy not found" };
          }
        },
      },
      {
        path: "/approvals/policies/:id",
        method: "delete",
        callback: (ctx) => {
          const deleted = ApprovalStore.instance.removePolicy(ctx.params.id);
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
          const status = ctx.query.status as
            | import("../types/approval").ApprovalStatus
            | undefined;
          const mine = ctx.query.mine === "true";
          const awaitingMyDecision = ctx.query.awaitingMyDecision === "true";
          const requester = extractRequester(ctx);

          let requests = ApprovalStore.instance.listRequests({ status });

          if (mine && requester) {
            requests = requests.filter(
              (r) => r.requester.userId === requester.userId
            );
          }

          if (awaitingMyDecision && requester) {
            requests = requests.filter((r) => {
              if (r.status !== "PENDING") return false;
              const policy = ApprovalStore.instance.getPolicy(r.policyId);
              if (!policy) return false;
              if (
                !policy.approvers.allowSelfApproval &&
                requester.userId === r.requester.userId
              ) {
                return false;
              }
              if (r.decisions.some((d) => d.userId === requester.userId)) {
                return false;
              }
              return ApprovalStore.instance.userIsAuthorized(
                { userId: requester.userId, roles: requester.roles },
                policy
              );
            });
          }

          return requests;
        },
      },
      {
        path: "/approvals/requests/:id",
        method: "get",
        callback: (ctx) => {
          const req = ApprovalStore.instance.getRequest(ctx.params.id);
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
          const requester = extractRequester(ctx);
          if (!requester) {
            ctx.status = 401;
            return { error: "Missing user identity" };
          }
          const dto = (ctx.request.body ?? {}) as ApprovalDecisionDto;
          try {
            const updated = await ApprovalStore.instance.decide(
              ctx.params.id,
              {
                userId: requester.userId,
                userEmail: requester.email,
                roles: requester.roles,
              },
              "APPROVE",
              dto
            );
            if (updated.status === "APPROVED") {
              ApprovalExecutor.instance
                .execute(updated.id)
                .catch((err) =>
                  console.error("[Approvals] Execute failed", err)
                );
            }
            return updated;
          } catch (err: any) {
            ctx.status = 400;
            return { error: err.message };
          }
        },
      },
      {
        path: "/approvals/requests/:id/reject",
        method: "post",
        callback: async (ctx) => {
          const requester = extractRequester(ctx);
          if (!requester) {
            ctx.status = 401;
            return { error: "Missing user identity" };
          }
          const dto = (ctx.request.body ?? {}) as ApprovalDecisionDto;
          try {
            return await ApprovalStore.instance.decide(
              ctx.params.id,
              {
                userId: requester.userId,
                userEmail: requester.email,
                roles: requester.roles,
              },
              "REJECT",
              dto
            );
          } catch (err: any) {
            ctx.status = 400;
            return { error: err.message };
          }
        },
      },
      {
        path: "/approvals/requests/:id/cancel",
        method: "post",
        callback: (ctx) => {
          const requester = extractRequester(ctx);
          if (!requester) {
            ctx.status = 401;
            return { error: "Missing user identity" };
          }
          try {
            return ApprovalStore.instance.cancel(ctx.params.id, {
              userId: requester.userId,
            });
          } catch (err: any) {
            ctx.status = 400;
            return { error: err.message };
          }
        },
      },
      {
        path: "/approvals/requests/:id/comments",
        method: "post",
        callback: (ctx) => {
          const requester = extractRequester(ctx);
          if (!requester) {
            ctx.status = 401;
            return { error: "Missing user identity" };
          }
          const dto = ctx.request.body as ApprovalCommentDto;
          if (!dto?.body || typeof dto.body !== "string") {
            ctx.status = 400;
            return { error: "Missing comment body" };
          }
          try {
            return ApprovalStore.instance.addComment(
              ctx.params.id,
              { userId: requester.userId, userEmail: requester.email },
              dto
            );
          } catch (err: any) {
            ctx.status = 404;
            return { error: err.message };
          }
        },
      },
      {
        path: "/approvals/requests/:id/retry",
        method: "post",
        callback: async (ctx) => {
          const req = ApprovalStore.instance.getRequest(ctx.params.id);
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
          (req as any).status = "APPROVED";
          (req as any).executionError = null;
          (req as any).updatedAt = new Date().toISOString();
          ApprovalExecutor.instance
            .execute(req.id)
            .catch((err) =>
              console.error("[Approvals] Retry execute failed", err)
            );
          return ApprovalStore.instance.getRequest(req.id);
        },
      },
    ];

    approvalRoutes.forEach((route) => this.addRoute(route));
  }

  generateViewRoutes() {
    type CreateViewDto = Omit<ViewConfig, "createdAt" | "updatedAt"> & {
      template: string;
    };
    type UpdateViewDto = Partial<
      Omit<ViewConfig, "slug" | "createdAt" | "updatedAt">
    > & { template?: string };

    const viewRoutes: Route[] = [
      {
        path: "/views",
        method: "get",
        callback: () => ViewsStore.instance.list(),
      },
      {
        path: "/views/:slug",
        method: "get",
        callback: (ctx) => {
          const view = ViewsStore.instance.get(ctx.params.slug);
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
          const dto = ctx.request.body as CreateViewDto;
          if (!dto?.slug || !dto?.name || !dto?.engine) {
            ctx.status = 400;
            return { error: "Missing slug, name, or engine" };
          }
          try {
            const view = ViewsStore.instance.create(dto);
            ctx.status = 201;
            return view;
          } catch (err: any) {
            ctx.status = err.status ?? 500;
            return { error: err.message };
          }
        },
      },
      {
        path: "/views/:slug",
        method: "put",
        callback: (ctx) => {
          const dto = ctx.request.body as UpdateViewDto;
          try {
            return ViewsStore.instance.update(ctx.params.slug, dto);
          } catch (err: any) {
            ctx.status = err.status ?? 500;
            return { error: err.message };
          }
        },
      },
      {
        path: "/views/:slug",
        method: "delete",
        callback: (ctx) => {
          const deleted = ViewsStore.instance.delete(ctx.params.slug);
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
