"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookExecutor = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
class WebhookExecutor {
    static async deliver(webhook, payload) {
        const body = JSON.stringify(payload);
        const headers = {
            "Content-Type": "application/json",
            "User-Agent": "ConnectorNode-Webhook/1.0",
            "X-Webhook-Id": webhook.id,
            "X-Webhook-Event": payload.event,
            "X-Webhook-Timestamp": payload.timestamp,
            "X-Webhook-Delivery": payload.id,
            ...(webhook.headers ?? {}),
        };
        if (webhook.secret) {
            headers["X-Webhook-Signature"] = WebhookExecutor.sign(body, webhook.secret);
        }
        const startTime = Date.now();
        try {
            const response = await axios_1.default.post(webhook.url, body, {
                headers,
                timeout: webhook.timeout,
                validateStatus: () => true,
            });
            const responseTime = Date.now() - startTime;
            const success = response.status >= 200 && response.status < 300;
            return {
                success,
                responseStatus: response.status,
                responseBody: response.data,
                responseHeaders: response.headers,
                responseTime,
                errorMessage: success ? null : `HTTP ${response.status}`,
            };
        }
        catch (error) {
            return {
                success: false,
                responseStatus: null,
                responseBody: null,
                responseHeaders: null,
                responseTime: Date.now() - startTime,
                errorMessage: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }
    static sign(body, secret) {
        return ("sha256=" +
            crypto_1.default.createHmac("sha256", secret).update(body).digest("hex"));
    }
}
exports.WebhookExecutor = WebhookExecutor;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViaG9vay1leGVjdXRvci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9pbmMvc2VydmljZXMvd2ViaG9vay1leGVjdXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSxrREFBMEI7QUFDMUIsb0RBQTRCO0FBTzVCLE1BQWEsZUFBZTtJQUMxQixNQUFNLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FDbEIsT0FBc0IsRUFDdEIsT0FBdUI7UUFFdkIsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNyQyxNQUFNLE9BQU8sR0FBMkI7WUFDdEMsY0FBYyxFQUFFLGtCQUFrQjtZQUNsQyxZQUFZLEVBQUUsMkJBQTJCO1lBQ3pDLGNBQWMsRUFBRSxPQUFPLENBQUMsRUFBRTtZQUMxQixpQkFBaUIsRUFBRSxPQUFPLENBQUMsS0FBSztZQUNoQyxxQkFBcUIsRUFBRSxPQUFPLENBQUMsU0FBUztZQUN4QyxvQkFBb0IsRUFBRSxPQUFPLENBQUMsRUFBRTtZQUNoQyxHQUFHLENBQUMsT0FBTyxDQUFDLE9BQU8sSUFBSSxFQUFFLENBQUM7U0FDM0IsQ0FBQztRQUVGLElBQUksT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ25CLE9BQU8sQ0FBQyxxQkFBcUIsQ0FBQyxHQUFHLGVBQWUsQ0FBQyxJQUFJLENBQ25ELElBQUksRUFDSixPQUFPLENBQUMsTUFBTSxDQUNmLENBQUM7UUFDSixDQUFDO1FBRUQsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBRTdCLElBQUksQ0FBQztZQUNILE1BQU0sUUFBUSxHQUFHLE1BQU0sZUFBSyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLElBQUksRUFBRTtnQkFDbkQsT0FBTztnQkFDUCxPQUFPLEVBQUUsT0FBTyxDQUFDLE9BQU87Z0JBQ3hCLGNBQWMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJO2FBQzNCLENBQUMsQ0FBQztZQUVILE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxTQUFTLENBQUM7WUFDNUMsTUFBTSxPQUFPLEdBQUcsUUFBUSxDQUFDLE1BQU0sSUFBSSxHQUFHLElBQUksUUFBUSxDQUFDLE1BQU0sR0FBRyxHQUFHLENBQUM7WUFFaEUsT0FBTztnQkFDTCxPQUFPO2dCQUNQLGNBQWMsRUFBRSxRQUFRLENBQUMsTUFBTTtnQkFDL0IsWUFBWSxFQUFFLFFBQVEsQ0FBQyxJQUFJO2dCQUMzQixlQUFlLEVBQUUsUUFBUSxDQUFDLE9BQWlDO2dCQUMzRCxZQUFZO2dCQUNaLFlBQVksRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsUUFBUSxRQUFRLENBQUMsTUFBTSxFQUFFO2FBQ3pELENBQUM7UUFDSixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE9BQU87Z0JBQ0wsT0FBTyxFQUFFLEtBQUs7Z0JBQ2QsY0FBYyxFQUFFLElBQUk7Z0JBQ3BCLFlBQVksRUFBRSxJQUFJO2dCQUNsQixlQUFlLEVBQUUsSUFBSTtnQkFDckIsWUFBWSxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxTQUFTO2dCQUNwQyxZQUFZLEVBQ1YsS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsZUFBZTthQUMzRCxDQUFDO1FBQ0osQ0FBQztJQUNILENBQUM7SUFFRCxNQUFNLENBQUMsSUFBSSxDQUFDLElBQVksRUFBRSxNQUFjO1FBQ3RDLE9BQU8sQ0FDTCxTQUFTO1lBQ1QsZ0JBQU0sQ0FBQyxVQUFVLENBQUMsUUFBUSxFQUFFLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQy9ELENBQUM7SUFDSixDQUFDO0NBQ0Y7QUE5REQsMENBOERDIn0=