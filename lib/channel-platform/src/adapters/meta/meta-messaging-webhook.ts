import { mapMetaDeliveryStatus } from "./meta-graph-webhook.js";

export type MetaMessagingWebhookObject = "instagram" | "page";

export type MetaMessagingWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    messaging?: MetaMessagingEvent[];
  }>;
};

export type MetaMessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: MetaMessagingWebhookMessage;
  delivery?: {
    mids?: string[];
    watermark?: number;
  };
  read?: {
    mid?: string;
    watermark?: number;
  };
  postback?: {
    mid?: string;
    title?: string;
    payload?: string;
  };
};

export type MetaMessagingWebhookMessage = {
  mid?: string;
  text?: string;
  attachments?: Array<{
    type?: string;
    payload?: {
      url?: string;
      sticker_id?: number;
    };
  }>;
  is_echo?: boolean;
  is_deleted?: boolean;
};

export type ParsedMetaMessagingWebhookEvent =
  | {
      kind: "message";
      idempotencyKey: string;
      externalThreadId: string;
      externalMessageId: string;
      senderExternalId: string;
      accountId?: string;
      message: MetaMessagingWebhookMessage;
      raw: Record<string, unknown>;
    }
  | {
      kind: "postback";
      idempotencyKey: string;
      externalThreadId: string;
      externalMessageId: string;
      senderExternalId: string;
      accountId?: string;
      postback: NonNullable<MetaMessagingEvent["postback"]>;
      raw: Record<string, unknown>;
    }
  | {
      kind: "status";
      idempotencyKey: string;
      externalMessageId: string;
      externalThreadId?: string;
      status: "sent" | "delivered" | "read" | "failed";
      providerResponse?: Record<string, unknown>;
      errorMessage?: string;
      raw: Record<string, unknown>;
    };

export function parseMetaMessagingWebhookEvents(
  rawPayload: Record<string, unknown>,
  objectType: MetaMessagingWebhookObject,
): ParsedMetaMessagingWebhookEvent[] {
  const payload = rawPayload as MetaMessagingWebhookPayload;
  if (payload.object !== objectType || !Array.isArray(payload.entry)) {
    return [];
  }

  const events: ParsedMetaMessagingWebhookEvent[] = [];

  for (const entry of payload.entry) {
    const accountId = typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : undefined;

    for (const messaging of entry.messaging ?? []) {
      const senderId = messaging.sender?.id?.trim();
      const recipientId = messaging.recipient?.id?.trim();
      const timestamp = messaging.timestamp ?? entry.time ?? Date.now();

      if (messaging.message?.mid && senderId && !messaging.message.is_echo && !messaging.message.is_deleted) {
        events.push({
          kind: "message",
          idempotencyKey: messaging.message.mid,
          externalThreadId: senderId,
          externalMessageId: messaging.message.mid,
          senderExternalId: senderId,
          accountId: accountId ?? recipientId,
          message: messaging.message,
          raw: rawPayload,
        });
        continue;
      }

      if (messaging.postback && senderId) {
        const postbackMid = messaging.postback.mid?.trim() || `${senderId}:postback:${timestamp}`;
        events.push({
          kind: "postback",
          idempotencyKey: postbackMid,
          externalThreadId: senderId,
          externalMessageId: postbackMid,
          senderExternalId: senderId,
          accountId: accountId ?? recipientId,
          postback: messaging.postback,
          raw: rawPayload,
        });
        continue;
      }

      if (messaging.delivery?.mids?.length) {
        for (const mid of messaging.delivery.mids) {
          events.push({
            kind: "status",
            idempotencyKey: `${mid}:delivered:${timestamp}`,
            externalMessageId: mid,
            externalThreadId: recipientId,
            status: mapMetaDeliveryStatus("delivered"),
            providerResponse: { delivery: messaging.delivery },
            raw: rawPayload,
          });
        }
        continue;
      }

      if (messaging.read) {
        const readMid = messaging.read.mid?.trim();
        const watermark = messaging.read.watermark ?? timestamp;
        if (readMid) {
          events.push({
            kind: "status",
            idempotencyKey: `${readMid}:read:${watermark}`,
            externalMessageId: readMid,
            externalThreadId: senderId,
            status: "read",
            providerResponse: { read: messaging.read },
            raw: rawPayload,
          });
        }
      }
    }
  }

  return events;
}

export function extractMetaMessagingAccountId(
  rawPayload: Record<string, unknown>,
  objectType: MetaMessagingWebhookObject,
): string | null {
  const payload = rawPayload as MetaMessagingWebhookPayload;
  if (payload.object !== objectType || !Array.isArray(payload.entry)) {
    return null;
  }

  for (const entry of payload.entry) {
    const entryId = typeof entry.id === "string" ? entry.id.trim() : "";
    if (entryId) return entryId;

    for (const event of entry.messaging ?? []) {
      const recipientId = event.recipient?.id?.trim();
      if (recipientId) return recipientId;
    }
  }

  return null;
}

export function summarizeMetaMessagingWebhookPayload(
  rawPayload: Record<string, unknown>,
  objectType: MetaMessagingWebhookObject,
): {
  object: string | null;
  entryCount: number;
  accountId: string | null;
  messagingCount: number;
} {
  const payload = rawPayload as MetaMessagingWebhookPayload;
  const messagingCount = (payload.entry ?? []).reduce(
    (count, entry) => count + (entry.messaging?.length ?? 0),
    0,
  );

  return {
    object: typeof payload.object === "string" ? payload.object : null,
    entryCount: Array.isArray(payload.entry) ? payload.entry.length : 0,
    accountId: extractMetaMessagingAccountId(rawPayload, objectType),
    messagingCount,
  };
}
