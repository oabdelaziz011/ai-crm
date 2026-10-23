/**
 * Derive quote delivery state from real quote + send-attempt data.
 * Never treat draft creation or a human-send request as "sent".
 */

export const QUOTE_DELIVERY_STATES = [
  "draft",
  "pending_human_approval",
  "sending",
  "sent",
  "failed",
] as const;

export type QuoteDeliveryState = (typeof QUOTE_DELIVERY_STATES)[number];

export const QUOTE_SEND_REQUEST_STATUSES = [
  "pending_human_approval",
  /** Human approved; QuoteSendService.send in flight (CAS claim against double approve). */
  "sending",
  "rejected",
  "approved_sent",
  "approved_failed",
] as const;

export type QuoteSendRequestStatus = (typeof QUOTE_SEND_REQUEST_STATUSES)[number];

export const AI_SEND_REQUEST_METADATA_KEY = "aiSendRequest";

export type QuoteAiSendRequest = {
  status: QuoteSendRequestStatus;
  channel: "email" | "whatsapp";
  requestedAt: string;
  requestedByUserId: string;
  conversationId: string | null;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  attemptId: string | null;
  errorCode: string | null;
};

export type QuoteSendAttemptSnapshot = {
  status: "pending" | "sent" | "failed";
  channel: string | null;
  errorCode: string | null;
  createdAt: string | null;
};

/** Quote row statuses that mean the customer-facing quote was delivered (or beyond). */
const POST_SEND_QUOTE_STATUSES = new Set([
  "sent",
  "viewed",
  "accepted",
  "rejected",
  "expired",
  "converted",
]);

export function readAiSendRequest(metadata: unknown): QuoteAiSendRequest | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string, unknown>)[AI_SEND_REQUEST_METADATA_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const status = typeof row.status === "string" ? row.status : "";
  if (!(QUOTE_SEND_REQUEST_STATUSES as readonly string[]).includes(status)) return null;
  const channel = row.channel === "whatsapp" ? "whatsapp" : row.channel === "email" ? "email" : null;
  if (!channel) return null;
  const requestedAt = typeof row.requestedAt === "string" ? row.requestedAt : "";
  const requestedByUserId = typeof row.requestedByUserId === "string" ? row.requestedByUserId : "";
  if (!requestedAt || !requestedByUserId) return null;
  return {
    status: status as QuoteSendRequestStatus,
    channel,
    requestedAt,
    requestedByUserId,
    conversationId: typeof row.conversationId === "string" ? row.conversationId : null,
    resolvedAt: typeof row.resolvedAt === "string" ? row.resolvedAt : null,
    resolvedByUserId: typeof row.resolvedByUserId === "string" ? row.resolvedByUserId : null,
    attemptId: typeof row.attemptId === "string" ? row.attemptId : null,
    errorCode: typeof row.errorCode === "string" ? row.errorCode : null,
  };
}

export function resolveQuoteDeliveryState(input: {
  quoteStatus: string;
  latestAttempt: QuoteSendAttemptSnapshot | null;
  sendRequest: QuoteAiSendRequest | null;
}): {
  deliveryState: QuoteDeliveryState;
  sent: boolean;
  quoteStatus: string;
  attemptStatus: QuoteSendAttemptSnapshot["status"] | null;
  sendRequestStatus: QuoteSendRequestStatus | null;
} {
  const quoteStatus = String(input.quoteStatus ?? "").trim().toLowerCase();
  const attempt = input.latestAttempt;
  const request = input.sendRequest;

  if (POST_SEND_QUOTE_STATUSES.has(quoteStatus) || attempt?.status === "sent") {
    return {
      deliveryState: "sent",
      sent: true,
      quoteStatus,
      attemptStatus: attempt?.status ?? (POST_SEND_QUOTE_STATUSES.has(quoteStatus) ? "sent" : null),
      sendRequestStatus: request?.status ?? null,
    };
  }

  if (attempt?.status === "pending" || request?.status === "sending") {
    return {
      deliveryState: "sending",
      sent: false,
      quoteStatus,
      attemptStatus: attempt?.status ?? null,
      sendRequestStatus: request?.status ?? null,
    };
  }

  if (request?.status === "pending_human_approval") {
    return {
      deliveryState: "pending_human_approval",
      sent: false,
      quoteStatus,
      attemptStatus: attempt?.status ?? null,
      sendRequestStatus: "pending_human_approval",
    };
  }

  if (attempt?.status === "failed" || request?.status === "approved_failed") {
    return {
      deliveryState: "failed",
      sent: false,
      quoteStatus,
      attemptStatus: attempt?.status ?? null,
      sendRequestStatus: request?.status ?? null,
    };
  }

  return {
    deliveryState: "draft",
    sent: false,
    quoteStatus,
    attemptStatus: attempt?.status ?? null,
    sendRequestStatus: request?.status ?? null,
  };
}
