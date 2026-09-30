/**
 * Infobip SMS API client for channel-platform outbound.
 * Never logs API keys.
 */

import { ValidationError } from "../../errors.js";

export const DEFAULT_INFOBIP_BASE_URL = "https://api.infobip.com";

export type InfobipSmsCredentials = {
  apiKey: string;
  baseUrl: string;
  fromNumber: string;
  enabled?: boolean;
  provider: "infobip";
};

export type InfobipSmsSendPayload = {
  to: string;
  from: string;
  body: string;
  notifyUrl?: string;
};

export type InfobipSmsApiMessageResponse = {
  messageId: string;
  status: string | null;
};

export function normalizeInfobipBaseUrl(raw: string | null | undefined): string {
  const trimmed = String(raw ?? "").trim().replace(/\/+$/, "");
  return trimmed || DEFAULT_INFOBIP_BASE_URL;
}

/** Map Infobip delivery group/name into channel_delivery_events statuses. */
export function mapInfobipMessageStatus(raw: string | undefined | null): "pending" | "sent" | "delivered" | "failed" | null {
  const status = String(raw ?? "").trim().toUpperCase();
  if (!status) return null;
  if (
    status.includes("PENDING") ||
    status.includes("ACCEPTED") ||
    status.includes("ENROUTE") ||
    status === "MESSAGE_ACCEPTED"
  ) {
    return "pending";
  }
  if (status.includes("SENT") || status === "DELIVERED_TO_OPERATOR") {
    return "sent";
  }
  if (status.includes("DELIVERED") || status === "DELIVERED_TO_HANDSET") {
    return "delivered";
  }
  if (
    status.includes("REJECTED") ||
    status.includes("UNDELIVERABLE") ||
    status.includes("EXPIRED") ||
    status.includes("FAILED")
  ) {
    return "failed";
  }
  return null;
}

export class InfobipSmsApiClient {
  constructor(
    private readonly options: {
      fetchFn?: typeof fetch;
      onOutboundRequest?: (detail: Record<string, unknown>) => void;
    } = {},
  ) {}

  async sendMessage(
    credentials: InfobipSmsCredentials,
    payload: InfobipSmsSendPayload,
  ): Promise<InfobipSmsApiMessageResponse> {
    const apiKey = credentials.apiKey.trim();
    const baseUrl = normalizeInfobipBaseUrl(credentials.baseUrl);
    const from = payload.from.trim();
    const to = payload.to.trim();
    const text = payload.body.trim();
    if (!apiKey) throw new ValidationError("Infobip API key is not configured.");
    if (!from) throw new ValidationError("Infobip sender ID is not configured.");
    if (!to) throw new ValidationError("SMS destination phone is required.");
    if (!text) throw new ValidationError("SMS body is required.");

    const url = `${baseUrl}/sms/2/text/advanced`;
    const message: Record<string, unknown> = {
      from,
      destinations: [{ to }],
      text,
    };
    if (payload.notifyUrl?.trim()) {
      message.notifyUrl = payload.notifyUrl.trim();
      message.notifyContentType = "application/json";
    }

    this.options.onOutboundRequest?.({
      stage: "infobip.sms.send.request",
      baseUrl,
      from,
      to,
      // never include apiKey
    });

    const fetchFn = this.options.fetchFn ?? fetch;
    const response = await fetchFn(url, {
      method: "POST",
      headers: {
        Authorization: `App ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ messages: [message] }),
    });

    let json: {
      messages?: Array<{
        messageId?: string;
        status?: { name?: string; groupName?: string; description?: string };
      }>;
      requestError?: { serviceException?: { text?: string; messageId?: string } };
    } = {};
    try {
      json = (await response.json()) as typeof json;
    } catch {
      // ignore
    }

    if (!response.ok) {
      const detail =
        json.requestError?.serviceException?.text ||
        json.requestError?.serviceException?.messageId ||
        `Infobip HTTP ${response.status}`;
      throw new ValidationError(String(detail));
    }

    const first = json.messages?.[0];
    const messageId = String(first?.messageId ?? "").trim();
    if (!messageId) {
      throw new ValidationError("Infobip did not return a messageId.");
    }

    return {
      messageId,
      status: first?.status?.name ?? first?.status?.groupName ?? null,
    };
  }

  /** Authenticated connectivity check — does not send an SMS. */
  async testConnection(credentials: Pick<InfobipSmsCredentials, "apiKey" | "baseUrl">): Promise<{
    ok: boolean;
    accountName?: string;
    error?: string;
    reason?: "provider_auth_failed" | "provider_unreachable";
  }> {
    const apiKey = credentials.apiKey.trim();
    const baseUrl = normalizeInfobipBaseUrl(credentials.baseUrl);
    if (!apiKey) {
      return { ok: false, error: "Infobip API key is incomplete.", reason: "provider_auth_failed" };
    }

    const fetchFn = this.options.fetchFn ?? fetch;
    try {
      const response = await fetchFn(`${baseUrl}/account/1/balance`, {
        method: "GET",
        headers: {
          Authorization: `App ${apiKey}`,
          Accept: "application/json",
        },
      });

      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          error: "SMS provider authentication failed.",
          reason: "provider_auth_failed",
        };
      }
      if (!response.ok) {
        return {
          ok: false,
          error: `SMS provider returned HTTP ${response.status}.`,
          reason: "provider_unreachable",
        };
      }

      let accountName: string | undefined;
      try {
        const body = (await response.json()) as { currency?: string; balance?: number };
        if (typeof body.currency === "string" && body.currency.trim()) {
          accountName = `Infobip (${body.currency.trim()})`;
        }
      } catch {
        // ignore
      }
      return { ok: true, accountName };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "SMS provider unreachable.",
        reason: "provider_unreachable",
      };
    }
  }
}
