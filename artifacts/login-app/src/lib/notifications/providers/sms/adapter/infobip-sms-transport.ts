/**
 * Node-only Infobip SMS transport for notification_queue processing.
 * Official SMS API: POST {baseUrl}/sms/2/text/advanced
 * Auth: Authorization: App {apiKey}
 */

import type {
  SmsVendorRuntimeConfig,
  SmsVendorSendInput,
  SmsVendorSendResult,
  SmsVendorTransport,
} from "./sms-vendor-transport";

const DEFAULT_INFOBIP_BASE_URL = "https://api.infobip.com";

export function normalizeInfobipBaseUrl(raw: string | null | undefined): string {
  const trimmed = String(raw ?? "").trim().replace(/\/+$/, "");
  return trimmed || DEFAULT_INFOBIP_BASE_URL;
}

function redactSecrets(value: string): string {
  return value.replace(/(App\s+)\S+/gi, "$1[REDACTED]").replace(/api[_-]?key[=:]\s*\S+/gi, "api_key=[REDACTED]");
}

export class InfobipSmsTransport implements SmsVendorTransport {
  readonly provider = "infobip" as const;

  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async send(message: SmsVendorSendInput, config: SmsVendorRuntimeConfig): Promise<SmsVendorSendResult> {
    const apiKey = String(config.apiKey ?? "").trim();
    const fromNumber = String(config.fromNumber ?? "").trim();
    const baseUrl = normalizeInfobipBaseUrl(config.baseUrl);
    const to = message.to.trim();
    const body = message.body.trim();

    if (!apiKey) throw new Error("Infobip API key is incomplete.");
    if (!fromNumber) throw new Error("Infobip sender ID is incomplete.");
    if (!to) throw new Error("SMS recipient phone is required.");
    if (!body) throw new Error("SMS body is empty.");

    const url = `${baseUrl}/sms/2/text/advanced`;
    const payload: Record<string, unknown> = {
      messages: [
        {
          from: fromNumber,
          destinations: [{ to: to.replace(/^\+/, "") }],
          text: body,
        },
      ],
    };
    // Destinations typically expect digits without +; keep E.164 with + if already international format
    // Infobip accepts both; prefer original E.164 when it starts with +
    if (to.startsWith("+")) {
      (payload.messages as Array<Record<string, unknown>>)[0]!.destinations = [{ to }];
    }

    if (config.statusCallback?.trim()) {
      (payload.messages as Array<Record<string, unknown>>)[0]!.notifyUrl = config.statusCallback.trim();
      (payload.messages as Array<Record<string, unknown>>)[0]!.notifyContentType = "application/json";
    }

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        Authorization: `App ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    let json: {
      messages?: Array<{
        messageId?: string;
        status?: { groupId?: number; groupName?: string; name?: string; description?: string };
      }>;
      requestError?: { serviceException?: { messageId?: string; text?: string } };
    } = {};
    try {
      json = (await response.json()) as typeof json;
    } catch {
      // fall through
    }

    if (!response.ok) {
      const detail =
        json.requestError?.serviceException?.text ||
        json.requestError?.serviceException?.messageId ||
        `Infobip HTTP ${response.status}`;
      throw new Error(redactSecrets(String(detail)));
    }

    const first = json.messages?.[0];
    const messageId = String(first?.messageId ?? "").trim();
    if (!messageId) {
      throw new Error("Infobip did not return a messageId.");
    }

    const statusName = first?.status?.name ?? first?.status?.groupName ?? null;
    return {
      messageId,
      status: typeof statusName === "string" ? statusName : null,
    };
  }
}

export { DEFAULT_INFOBIP_BASE_URL };
