"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isIpAllowed = exports.getRequestIp = exports.normalizeIpAddress = void 0;
const node_net_1 = require("node:net");
const takeFirstHeaderValue = (value) => {
    if (Array.isArray(value)) {
        return takeFirstHeaderValue(value[0]);
    }
    if (typeof value !== "string") {
        return null;
    }
    const first = value.split(",")[0]?.trim();
    return first ? first : null;
};
const normalizeIpAddress = (value) => {
    if (!value) {
        return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    if (trimmed.startsWith("::ffff:")) {
        return (0, exports.normalizeIpAddress)(trimmed.slice("::ffff:".length));
    }
    if (trimmed.startsWith("[")) {
        const bracketMatch = trimmed.match(/^\[([^\]]+)\](?::\d+)?$/);
        if (bracketMatch) {
            return (0, exports.normalizeIpAddress)(bracketMatch[1]);
        }
    }
    const ipv4WithPortMatch = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
    if (ipv4WithPortMatch) {
        return (0, exports.normalizeIpAddress)(ipv4WithPortMatch[1]);
    }
    if ((0, node_net_1.isIP)(trimmed)) {
        return trimmed.toLowerCase();
    }
    return null;
};
exports.normalizeIpAddress = normalizeIpAddress;
const getRequestIp = (request) => {
    const forwardedIp = takeFirstHeaderValue(request.headers?.["x-forwarded-for"]);
    const realIp = takeFirstHeaderValue(request.headers?.["x-real-ip"]);
    return ((0, exports.normalizeIpAddress)(forwardedIp) ??
        (0, exports.normalizeIpAddress)(realIp) ??
        (0, exports.normalizeIpAddress)(request.ip) ??
        (0, exports.normalizeIpAddress)(request.socket?.remoteAddress ?? null));
};
exports.getRequestIp = getRequestIp;
const isIpAllowed = (requestIp, allowedIps) => {
    const normalizedRequestIp = (0, exports.normalizeIpAddress)(requestIp);
    if (!normalizedRequestIp || !allowedIps?.length) {
        return false;
    }
    return allowedIps.some((allowedIp) => (0, exports.normalizeIpAddress)(allowedIp) === normalizedRequestIp);
};
exports.isIpAllowed = isIpAllowed;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVxdWVzdC1pcC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9pbmMvdXRpbHMvcmVxdWVzdC1pcC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSx1Q0FBZ0M7QUFZaEMsTUFBTSxvQkFBb0IsR0FBRyxDQUFDLEtBQWtCLEVBQWlCLEVBQUU7SUFDakUsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDekIsT0FBTyxvQkFBb0IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN4QyxDQUFDO0lBRUQsSUFBSSxPQUFPLEtBQUssS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUM5QixPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7SUFFRCxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxDQUFDO0lBQzFDLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztBQUM5QixDQUFDLENBQUM7QUFFSyxNQUFNLGtCQUFrQixHQUFHLENBQ2hDLEtBQWdDLEVBQ2pCLEVBQUU7SUFDakIsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ1gsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBRUQsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO0lBQzdCLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNiLE9BQU8sSUFBSSxDQUFDO0lBQ2QsQ0FBQztJQUVELElBQUksT0FBTyxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO1FBQ2xDLE9BQU8sSUFBQSwwQkFBa0IsRUFBQyxPQUFPLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0lBQzdELENBQUM7SUFFRCxJQUFJLE9BQU8sQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUM1QixNQUFNLFlBQVksR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUM7UUFDOUQsSUFBSSxZQUFZLEVBQUUsQ0FBQztZQUNqQixPQUFPLElBQUEsMEJBQWtCLEVBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDN0MsQ0FBQztJQUNILENBQUM7SUFFRCxNQUFNLGlCQUFpQixHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsaUNBQWlDLENBQUMsQ0FBQztJQUMzRSxJQUFJLGlCQUFpQixFQUFFLENBQUM7UUFDdEIsT0FBTyxJQUFBLDBCQUFrQixFQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbEQsQ0FBQztJQUVELElBQUksSUFBQSxlQUFJLEVBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztRQUNsQixPQUFPLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUMvQixDQUFDO0lBRUQsT0FBTyxJQUFJLENBQUM7QUFDZCxDQUFDLENBQUM7QUFqQ1csUUFBQSxrQkFBa0Isc0JBaUM3QjtBQUVLLE1BQU0sWUFBWSxHQUFHLENBQUMsT0FBb0IsRUFBaUIsRUFBRTtJQUNsRSxNQUFNLFdBQVcsR0FBRyxvQkFBb0IsQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDO0lBQy9FLE1BQU0sTUFBTSxHQUFHLG9CQUFvQixDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO0lBRXBFLE9BQU8sQ0FDTCxJQUFBLDBCQUFrQixFQUFDLFdBQVcsQ0FBQztRQUMvQixJQUFBLDBCQUFrQixFQUFDLE1BQU0sQ0FBQztRQUMxQixJQUFBLDBCQUFrQixFQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7UUFDOUIsSUFBQSwwQkFBa0IsRUFBQyxPQUFPLENBQUMsTUFBTSxFQUFFLGFBQWEsSUFBSSxJQUFJLENBQUMsQ0FDMUQsQ0FBQztBQUNKLENBQUMsQ0FBQztBQVZXLFFBQUEsWUFBWSxnQkFVdkI7QUFFSyxNQUFNLFdBQVcsR0FBRyxDQUN6QixTQUFvQyxFQUNwQyxVQUFnQyxFQUN2QixFQUFFO0lBQ1gsTUFBTSxtQkFBbUIsR0FBRyxJQUFBLDBCQUFrQixFQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQzFELElBQUksQ0FBQyxtQkFBbUIsSUFBSSxDQUFDLFVBQVUsRUFBRSxNQUFNLEVBQUUsQ0FBQztRQUNoRCxPQUFPLEtBQUssQ0FBQztJQUNmLENBQUM7SUFFRCxPQUFPLFVBQVUsQ0FBQyxJQUFJLENBQ3BCLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxJQUFBLDBCQUFrQixFQUFDLFNBQVMsQ0FBQyxLQUFLLG1CQUFtQixDQUNyRSxDQUFDO0FBQ0osQ0FBQyxDQUFDO0FBWlcsUUFBQSxXQUFXLGVBWXRCIn0=