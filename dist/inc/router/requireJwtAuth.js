"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireJwtAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const request_ip_1 = require("../utils/request-ip");
const requireJwtAuth = (secretKey) => {
    return async (ctx, next) => {
        const authHeader = ctx.request.headers.authorization;
        const [scheme, token] = (authHeader ?? "").split(" ");
        if (scheme !== "Bearer" || !token) {
            ctx.status = 401;
            ctx.body = { error: "unauthorized", reason: "missing" };
            return;
        }
        try {
            const decoded = jsonwebtoken_1.default.verify(token, secretKey, {
                algorithms: ["HS256"],
                clockTolerance: 5,
            });
            if (typeof decoded === "string") {
                ctx.status = 401;
                ctx.body = { error: "unauthorized", reason: "invalid" };
                return;
            }
            const claims = decoded;
            if (claims.allowedIps?.length &&
                !(0, request_ip_1.isIpAllowed)((0, request_ip_1.getRequestIp)(ctx.req), claims.allowedIps)) {
                ctx.status = 403;
                ctx.body = { error: "forbidden", reason: "ip_not_allowed" };
                return;
            }
            ctx.state.auth = claims;
            await next();
        }
        catch (err) {
            const reason = err instanceof Error && err.name === "TokenExpiredError"
                ? "expired"
                : "invalid";
            ctx.status = 401;
            ctx.body = { error: "unauthorized", reason };
        }
    };
};
exports.requireJwtAuth = requireJwtAuth;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVxdWlyZUp3dEF1dGguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvaW5jL3JvdXRlci9yZXF1aXJlSnd0QXV0aC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUFDQSxnRUFBK0I7QUFFL0Isb0RBQWdFO0FBYXpELE1BQU0sY0FBYyxHQUFHLENBQUMsU0FBaUIsRUFBYyxFQUFFO0lBQzlELE9BQU8sS0FBSyxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsRUFBRTtRQUN6QixNQUFNLFVBQVUsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUM7UUFDckQsTUFBTSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDdEQsSUFBSSxNQUFNLEtBQUssUUFBUSxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDbEMsR0FBRyxDQUFDLE1BQU0sR0FBRyxHQUFHLENBQUM7WUFDakIsR0FBRyxDQUFDLElBQUksR0FBRyxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxDQUFDO1lBQ3hELE9BQU87UUFDVCxDQUFDO1FBRUQsSUFBSSxDQUFDO1lBQ0gsTUFBTSxPQUFPLEdBQUcsc0JBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRTtnQkFDM0MsVUFBVSxFQUFFLENBQUMsT0FBTyxDQUFDO2dCQUNyQixjQUFjLEVBQUUsQ0FBQzthQUNsQixDQUFDLENBQUM7WUFFSCxJQUFJLE9BQU8sT0FBTyxLQUFLLFFBQVEsRUFBRSxDQUFDO2dCQUNoQyxHQUFHLENBQUMsTUFBTSxHQUFHLEdBQUcsQ0FBQztnQkFDakIsR0FBRyxDQUFDLElBQUksR0FBRyxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxDQUFDO2dCQUN4RCxPQUFPO1lBQ1QsQ0FBQztZQUVELE1BQU0sTUFBTSxHQUFHLE9BQXFCLENBQUM7WUFDckMsSUFDRSxNQUFNLENBQUMsVUFBVSxFQUFFLE1BQU07Z0JBQ3pCLENBQUMsSUFBQSx3QkFBVyxFQUFDLElBQUEseUJBQVksRUFBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsTUFBTSxDQUFDLFVBQVUsQ0FBQyxFQUN0RCxDQUFDO2dCQUNELEdBQUcsQ0FBQyxNQUFNLEdBQUcsR0FBRyxDQUFDO2dCQUNqQixHQUFHLENBQUMsSUFBSSxHQUFHLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxNQUFNLEVBQUUsZ0JBQWdCLEVBQUUsQ0FBQztnQkFDNUQsT0FBTztZQUNULENBQUM7WUFFRCxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksR0FBRyxNQUFNLENBQUM7WUFDeEIsTUFBTSxJQUFJLEVBQUUsQ0FBQztRQUNmLENBQUM7UUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQ2IsTUFBTSxNQUFNLEdBQ1YsR0FBRyxZQUFZLEtBQUssSUFBSSxHQUFHLENBQUMsSUFBSSxLQUFLLG1CQUFtQjtnQkFDdEQsQ0FBQyxDQUFDLFNBQVM7Z0JBQ1gsQ0FBQyxDQUFDLFNBQVMsQ0FBQztZQUNoQixHQUFHLENBQUMsTUFBTSxHQUFHLEdBQUcsQ0FBQztZQUNqQixHQUFHLENBQUMsSUFBSSxHQUFHLEVBQUUsS0FBSyxFQUFFLGNBQWMsRUFBRSxNQUFNLEVBQUUsQ0FBQztRQUMvQyxDQUFDO0lBQ0gsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDO0FBM0NXLFFBQUEsY0FBYyxrQkEyQ3pCIn0=