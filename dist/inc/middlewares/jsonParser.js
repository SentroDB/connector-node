"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = JsonParserMiddleware;
function JsonParserMiddleware() {
    return async (ctx, next) => {
        await next();
        const body = ctx.body;
        if (body === undefined || body === null)
            return;
        if (typeof body === "string" || Buffer.isBuffer(body)) {
            return;
        }
        if (typeof body?.pipe === "function") {
            return;
        }
        ctx.type = "application/json";
        ctx.body = JSON.stringify(body, (_key, value) => (typeof value === "bigint" ? value.toString() : value));
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoianNvblBhcnNlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9pbmMvbWlkZGxld2FyZXMvanNvblBhcnNlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUdBLHVDQXFCQztBQXJCRCxTQUF3QixvQkFBb0I7SUFDeEMsT0FBTyxLQUFLLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxFQUFFO1FBQ3ZCLE1BQU0sSUFBSSxFQUFFLENBQUM7UUFFYixNQUFNLElBQUksR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDO1FBQ3RCLElBQUksSUFBSSxLQUFLLFNBQVMsSUFBSSxJQUFJLEtBQUssSUFBSTtZQUFFLE9BQU87UUFFaEQsSUFBSSxPQUFPLElBQUksS0FBSyxRQUFRLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ3BELE9BQU87UUFDWCxDQUFDO1FBRUQsSUFBSSxPQUFRLElBQVksRUFBRSxJQUFJLEtBQUssVUFBVSxFQUFFLENBQUM7WUFDNUMsT0FBTztRQUNYLENBQUM7UUFFRCxHQUFHLENBQUMsSUFBSSxHQUFHLGtCQUFrQixDQUFDO1FBQzlCLEdBQUcsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FDckIsSUFBSSxFQUNKLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQyxPQUFPLEtBQUssS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQzFFLENBQUM7SUFDTixDQUFDLENBQUM7QUFDTixDQUFDIn0=