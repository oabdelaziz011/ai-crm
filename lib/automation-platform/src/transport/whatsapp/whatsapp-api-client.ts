import { verifyHmacSha256Hex } from "@workspace/platform-crypto";
import { ChannelProviderError } from "../../errors.js";
import type { WhatsAppCompanyConfig } from "./whatsapp-config.js";
import { whatsAppMessagesUrl } from "./whatsapp-config.js";
import type {
  ParsedWhatsAppWebhookEvent,
  WhatsAppSendMessagePayload,
  WhatsAppSendMessageResponse,
  WhatsAppWebhookPayload,
} from "./whatsapp-types.js";

export type WhatsAppApiClientOptions = {
  fetchFn?: typeof fetch;
};

export class WhatsAppApiClient {
  private readonly fetchFn: typeof fetch;

  constructor(options: WhatsAppApiClientOptions = {}) {
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  async sendMessage(
    config: Pick<WhatsAppCompanyConfig, "phoneNumberId" | "accessToken" | "apiVersion">,
    payload: WhatsAppSendMessagePayload,
  ): Promise<WhatsAppSendMessageResponse> {
    const response = await this.fetchFn(whatsAppMessagesUrl(config), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const body = (await response.json()) as WhatsAppSendMessageResponse & {
      error?: { message?: string; error_user_msg?: string };
    };

    if (!response.ok) {
      const error = new ChannelProviderError(
        body.error?.error_user_msg ?? body.error?.message ?? `WhatsApp API error (${response.status})`,
      ) as ChannelProviderError & { statusCode?: number };
      error.statusCode = response.status;
      throw error;
    }

    return body;
  }
}

export function verifyWhatsAppWebhookChallenge(input: {
  mode?: string;
  verifyToken?: string;
  challenge?: string;
  expectedVerifyToken: string;
}): string | null {
  if (input.mode !== "subscribe") return null;
  if (!input.challenge || input.verifyToken !== input.expectedVerifyToken) return null;
  return input.challenge;
}

export async function verifyWhatsAppWebhookSignature(input: {
  signatureHeader?: string | null;
  rawBody: string;
  appSecret?: string | null;
  requireSecret?: boolean;
}): Promise<boolean> {
  const secret = input.appSecret?.trim();
  if (!secret) {
    return input.requireSecret ? false : true;
  }

  const header = input.signatureHeader?.trim();
  if (!header?.startsWith("sha256=")) {
    return false;
  }

  const expectedHex = header.slice("sha256=".length);
  return verifyHmacSha256Hex({
    secret,
    payload: input.rawBody,
    expectedHex,
  });
}

export function parseWhatsAppWebhookEvents(rawPayload: Record<string, unknown>): ParsedWhatsAppWebhookEvent[] {
  const payload = rawPayload as WhatsAppWebhookPayload;
  if (payload.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) {
    return [];
  }

  const events: ParsedWhatsAppWebhookEvent[] = [];

  for (const entry of payload.entry) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      const phoneNumberId = value.metadata?.phone_number_id;

      for (const message of value.messages ?? []) {
        events.push({
          kind: "message",
          idempotencyKey: message.id,
          externalThreadId: message.from,
          externalMessageId: message.id,
          senderExternalId: message.from,
          senderName: value.contacts?.find((contact) => contact.wa_id === message.from)?.profile?.name,
          phoneNumberId,
          message,
          raw: rawPayload,
        });
      }

      for (const status of value.statuses ?? []) {
        events.push({
          kind: "status",
          idempotencyKey: `${status.id}:${status.status}:${status.timestamp}`,
          externalMessageId: status.id,
          externalThreadId: status.recipient_id,
          status: status.status,
          providerResponse: { status },
          errorMessage: status.errors?.[0]?.message ?? status.errors?.[0]?.title,
          raw: rawPayload,
        });
      }
    }
  }

  return events;
}
