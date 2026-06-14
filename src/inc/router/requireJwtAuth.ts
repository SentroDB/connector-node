import type { Middleware } from "koa";
import jwt from "jsonwebtoken";

import { getRequestIp, isIpAllowed } from "../utils/request-ip";

export interface AuthClaims {
  sub: string;
  email: string;
  roles: string[];
  pid: string;
  eid: string;
  allowedIps?: string[];
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

      const claims = decoded as AuthClaims;
      if (
        claims.allowedIps?.length &&
        !isIpAllowed(getRequestIp(ctx.req), claims.allowedIps)
      ) {
        ctx.status = 403;
        ctx.body = { error: "forbidden", reason: "ip_not_allowed" };
        return;
      }

      ctx.state.auth = claims;
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
