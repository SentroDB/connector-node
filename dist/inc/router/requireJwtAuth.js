"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireJwtAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
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
            ctx.state.auth = decoded;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVxdWlyZUp3dEF1dGguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvaW5jL3JvdXRlci9yZXF1aXJlSnd0QXV0aC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUFDQSxnRUFBK0I7QUFZeEIsTUFBTSxjQUFjLEdBQUcsQ0FBQyxTQUFpQixFQUFjLEVBQUU7SUFDOUQsT0FBTyxLQUFLLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxFQUFFO1FBQ3pCLE1BQU0sVUFBVSxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQztRQUNyRCxNQUFNLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN0RCxJQUFJLE1BQU0sS0FBSyxRQUFRLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNsQyxHQUFHLENBQUMsTUFBTSxHQUFHLEdBQUcsQ0FBQztZQUNqQixHQUFHLENBQUMsSUFBSSxHQUFHLEVBQUUsS0FBSyxFQUFFLGNBQWMsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLENBQUM7WUFDeEQsT0FBTztRQUNULENBQUM7UUFFRCxJQUFJLENBQUM7WUFDSCxNQUFNLE9BQU8sR0FBRyxzQkFBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsU0FBUyxFQUFFO2dCQUMzQyxVQUFVLEVBQUUsQ0FBQyxPQUFPLENBQUM7Z0JBQ3JCLGNBQWMsRUFBRSxDQUFDO2FBQ2xCLENBQUMsQ0FBQztZQUVILElBQUksT0FBTyxPQUFPLEtBQUssUUFBUSxFQUFFLENBQUM7Z0JBQ2hDLEdBQUcsQ0FBQyxNQUFNLEdBQUcsR0FBRyxDQUFDO2dCQUNqQixHQUFHLENBQUMsSUFBSSxHQUFHLEVBQUUsS0FBSyxFQUFFLGNBQWMsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLENBQUM7Z0JBQ3hELE9BQU87WUFDVCxDQUFDO1lBQ0QsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLEdBQUcsT0FBcUIsQ0FBQztZQUN2QyxNQUFNLElBQUksRUFBRSxDQUFDO1FBQ2YsQ0FBQztRQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7WUFDYixNQUFNLE1BQU0sR0FDVixHQUFHLFlBQVksS0FBSyxJQUFJLEdBQUcsQ0FBQyxJQUFJLEtBQUssbUJBQW1CO2dCQUN0RCxDQUFDLENBQUMsU0FBUztnQkFDWCxDQUFDLENBQUMsU0FBUyxDQUFDO1lBQ2hCLEdBQUcsQ0FBQyxNQUFNLEdBQUcsR0FBRyxDQUFDO1lBQ2pCLEdBQUcsQ0FBQyxJQUFJLEdBQUcsRUFBRSxLQUFLLEVBQUUsY0FBYyxFQUFFLE1BQU0sRUFBRSxDQUFDO1FBQy9DLENBQUM7SUFDSCxDQUFDLENBQUM7QUFDSixDQUFDLENBQUM7QUFoQ1csUUFBQSxjQUFjLGtCQWdDekIifQ==