import type { ParsedMetaMessagingWebhookEvent } from "../meta/meta-messaging-webhook.js";

const MESSAGING_EVENT_INDICATORS = [
  "message",
  "messages",
  "postback",
  "delivery",
  "read",
  "reaction",
  "referral",
  "message_edit",
  "optin",
  "agent_message",
  "agent_messages",
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readId(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function describeIdType(value: unknown): "string" | "number" | "missing" | "other" {
  if (typeof value === "string") return value.trim() ? "string" : "missing";
  if (typeof value === "number") return "number";
  if (value == null) return "missing";
  return "other";
}

function objectKeys(value: unknown): string[] {
  const record = asRecord(value);
  return record ? Object.keys(record) : [];
}

function normalizeParty(value: unknown): { id?: string } | undefined {
  const direct = readId(value);
  if (direct) return { id: direct };
  const record = asRecord(value);
  if (!record) return undefined;
  const id = readId(record.id) || readId(record.user_id);
  return id ? { id } : undefined;
}

function normalizeMessage(raw: unknown): Record<string, unknown> | null {
  const record = asRecord(raw);
  if (!record) return null;
  const mid = readId(record.mid) || readId(record.id);
  const isSelf = record.is_self === true;
  const isEcho = record.is_echo === true && !isSelf;
  const normalized: Record<string, unknown> = { ...record };
  if (mid) normalized.mid = mid;
  if (isEcho) normalized.is_echo = true;
  else delete normalized.is_echo;
  if (record.is_deleted === true) normalized.is_deleted = true;
  return normalized;
}

function readMessagingMessage(item: Record<string, unknown>): Record<string, unknown> | null {
  return normalizeMessage(item.message) ?? normalizeMessage(item.messages);
}

function hasInboundContent(message: Record<string, unknown> | null): boolean {
  if (!message) return false;
  if (typeof message.text === "string" && message.text.trim()) return true;
  if (Array.isArray(message.attachments) && message.attachments.length > 0) return true;
  if (asRecord(message.quick_reply)) return true;
  return Boolean(readId(message.mid));
}

export function describeInstagramWebhookShape(rawPayload: Record<string, unknown>): Record<string, unknown> {
  const entries = Array.isArray(rawPayload.entry) ? rawPayload.entry : [];
  return {
    instagramWebhookShapeDiag: true,
    object: typeof rawPayload.object === "string" ? rawPayload.object : null,
    payloadKeys: Object.keys(rawPayload),
    entryCount: entries.length,
    entries: entries.slice(0, 3).map((entry) => {
      const record = asRecord(entry);
      const messaging = Array.isArray(record?.messaging) ? record.messaging : [];
      const changes = Array.isArray(record?.changes) ? record.changes : [];
      return {
        entryKeys: record ? Object.keys(record) : [],
        messagingCount: messaging.length,
        changesCount: changes.length,
        changeFields: changes
          .map((change) => asRecord(change)?.field)
          .filter((field): field is string => typeof field === "string"),
        messaging: messaging.slice(0, 5).map((item) => {
          const messagingItem = asRecord(item) ?? {};
          const sender = asRecord(messagingItem.sender) ?? asRecord(messagingItem.from);
          const recipient = asRecord(messagingItem.recipient) ?? asRecord(messagingItem.to);
          const message = asRecord(messagingItem.message) ?? asRecord(messagingItem.messages);
          const entryId = readId(record?.id);
          const senderId = readId(sender?.id ?? messagingItem.sender);
          const recipientId = readId(recipient?.id ?? messagingItem.recipient);
          return {
            messagingItemKeys: Object.keys(messagingItem),
            senderKeys: objectKeys(sender),
            recipientKeys: objectKeys(recipient),
            messageKeys: objectKeys(message),
            senderIdType: describeIdType(sender?.id ?? messagingItem.sender),
            recipientIdType: describeIdType(recipient?.id ?? messagingItem.recipient),
            senderIsEntryAccount: entryId && senderId ? senderId === entryId : null,
            recipientIsEntryAccount: entryId && recipientId ? recipientId === entryId : null,
            hasMessageMid: Boolean(readId(message?.mid) || readId(message?.id)),
            hasMessageText: typeof message?.text === "string",
            hasAttachments: Array.isArray(message?.attachments),
            isEcho: message?.is_echo === true,
            isDeleted: message?.is_deleted === true,
            isSelf: message?.is_self === true,
            eventIndicators: Object.keys(messagingItem).filter((key) =>
              (MESSAGING_EVENT_INDICATORS as readonly string[]).includes(key),
            ),
          };
        }),
      };
    }),
  };
}

export function normalizeInstagramWebhookPayload(
  rawPayload: Record<string, unknown>,
): Record<string, unknown> {
  const entries = Array.isArray(rawPayload.entry) ? rawPayload.entry : [];
  return {
    ...rawPayload,
    object: rawPayload.object,
    entry: entries.map((entry) => {
      const record = asRecord(entry) ?? {};
      const accountId = readId(record.id);
      const messaging = Array.isArray(record.messaging) ? record.messaging : [];
      const changes = Array.isArray(record.changes) ? record.changes : [];
      const fromChanges = changes
        .map((change) => asRecord(change))
        .filter((change): change is Record<string, unknown> => Boolean(change))
        .filter((change) => {
          const field = typeof change.field === "string" ? change.field : "";
          return field === "messages" || field === "messaging_postbacks" || field === "message";
        })
        .map((change) => change.value);

      const normalizedMessaging = [...messaging, ...fromChanges].map((item) => {
        const messagingItem = asRecord(item) ?? {};
        const sender = normalizeParty(messagingItem.sender ?? messagingItem.from);
        const recipient = normalizeParty(messagingItem.recipient ?? messagingItem.to);
        const message = readMessagingMessage(messagingItem);
        const timestamp = messagingItem.timestamp ?? record.time;
        const postback = asRecord(messagingItem.postback);
        const next: Record<string, unknown> = { ...messagingItem };
        if (sender) next.sender = sender;
        if (recipient) next.recipient = recipient;
        if (typeof timestamp === "number" || typeof timestamp === "string") next.timestamp = timestamp;
        if (message) {
          const senderId = sender?.id ?? "";
          // Instagram Login sometimes flags a customer DM with is_echo. Only a
          // message sent BY the professional account is a true outbound echo.
          if (message.is_echo === true && senderId && accountId && senderId !== accountId) {
            delete message.is_echo;
          }
          if (!readId(message.mid) && hasInboundContent(message) && senderId) {
            message.mid = `ig:${senderId}:${String(timestamp ?? "0")}`;
          }
          next.message = message;
        }
        if (postback) {
          const mid = readId(postback.mid) || readId(postback.id);
          next.postback = mid ? { ...postback, mid } : postback;
        }
        return next;
      });

      return {
        ...record,
        id: accountId || record.id,
        messaging: normalizedMessaging,
      };
    }),
  };
}

export function parseNormalizedInstagramWebhookEvents(
  parseMetaEvents: (
    rawPayload: Record<string, unknown>,
    objectType: "instagram",
  ) => ParsedMetaMessagingWebhookEvent[],
  rawPayload: Record<string, unknown>,
): ParsedMetaMessagingWebhookEvent[] {
  return parseMetaEvents(normalizeInstagramWebhookPayload(rawPayload), "instagram");
}
