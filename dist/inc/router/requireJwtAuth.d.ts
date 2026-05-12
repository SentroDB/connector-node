import type { Middleware } from "koa";
export interface AuthClaims {
    sub: string;
    email: string;
    roles: string[];
    pid: string;
    eid: string;
    iat: number;
    exp: number;
}
export declare const requireJwtAuth: (secretKey: string) => Middleware;
//# sourceMappingURL=requireJwtAuth.d.ts.map