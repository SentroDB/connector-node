
import type Koa from "koa";

export default function JsonParserMiddleware(): Koa.Middleware {
    return async (ctx, next) => {
        await next();

        const body = ctx.body;
        if (body === undefined || body === null) return;

        if (typeof body === "string" || Buffer.isBuffer(body)) {
            return;
        }

        if (typeof (body as any)?.pipe === "function") {
            return;
        }

        ctx.type = "application/json";
        ctx.body = JSON.stringify(
            body,
            (_key, value) => (typeof value === "bigint" ? value.toString() : value),
        );
    };
}
