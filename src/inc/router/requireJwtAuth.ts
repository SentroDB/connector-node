import type { Middleware } from "koa";
import jwt from "jsonwebtoken";

export interface AuthClaims {
  sub: string;
  email: string;
  roles: string[];
  pid: string;
  eid: string;
  iat: number;
  exp: number;
}

export const requireJwtAuth = (secretKey: string): Middleware => {
  return async (ctx, next) => {
    const authHeader = ctx.request.headers.authorization;
    const [scheme, token] = (authHeader ?? "").split(" ");
    if (scheme !== "Bearer" || !token) {
      ctx.status = 401;
      ctx.body = { error: "unauthorized", reason: "missing" };
      return;
    }

    try {
      const decoded = jwt.verify(token, secretKey, {
        algorithms: ["HS256"],
        clockTolerance: 5,
      });
      if (typeof decoded === "string") {
        ctx.status = 401;
        ctx.body = { error: "unauthorized", reason: "invalid" };
        return;
      }
      ctx.state.auth = decoded as AuthClaims;
      await next();
    } catch (err) {
      const reason =
        err instanceof Error && err.name === "TokenExpiredError"
          ? "expired"
          : "invalid";
      ctx.status = 401;
      ctx.body = { error: "unauthorized", reason };
    }
  };
};
