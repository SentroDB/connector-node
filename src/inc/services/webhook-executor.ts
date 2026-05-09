import axios from "axios";
import crypto from "crypto";
import type {
  WebhookConfig,
  WebhookPayload,
  DeliveryResult,
} from "../types/webhook";

export class WebhookExecutor {
  static async deliver(
    webhook: WebhookConfig,
    payload: WebhookPayload
  ): Promise<DeliveryResult> {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "ConnectorNode-Webhook/1.0",
      "X-Webhook-Id": webhook.id,
      "X-Webhook-Event": payload.event,
      "X-Webhook-Timestamp": payload.timestamp,
      "X-Webhook-Delivery": payload.id,
      ...(webhook.headers ?? {}),
    };

    if (webhook.secret) {
      headers["X-Webhook-Signature"] = WebhookExecutor.sign(
        body,
        webhook.secret
      );
    }

    const startTime = Date.now();

    try {
      const response = await axios.post(webhook.url, body, {
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
        responseHeaders: response.headers as Record<string, string>,
        responseTime,
        errorMessage: success ? null : `HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        success: false,
        responseStatus: null,
        responseBody: null,
        responseHeaders: null,
        responseTime: Date.now() - startTime,
        errorMessage:
          error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  static sign(body: string, secret: string): string {
    return (
      "sha256=" +
      crypto.createHmac("sha256", secret).update(body).digest("hex")
    );
  }
}
