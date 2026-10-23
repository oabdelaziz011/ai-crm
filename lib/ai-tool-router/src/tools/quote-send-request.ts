/**
 * AI request to send a draft quote — never calls the outbound send path.
 * A human with quotes.send must approve; delivery uses existing QuoteSendService.
 */

import {
  AI_SEND_REQUEST_METADATA_KEY,
  readAiSendRequest,
  resolveQuoteDeliveryState,
  type QuoteAiSendRequest,
  type QuoteDeliveryState,
  type QuoteSendAttemptSnapshot,
} from "./quote-delivery-status.js";

export type QuoteSendChannelChoice = "email" | "whatsapp";

export type QuoteDeliveryCommandDeps = {
  loadQuoteForCompany(input: {
    companyId: string;
    quoteId: string;
  }): Promise<{
    quoteId: string;
    quoteNumber: string;
    status: string;
    companyId: string;
    opportunityId: string | null;
    metadata: Record<string, unknown>;
    lineCount: number;
  } | null>;

  findLatestDraftQuoteForConversation(input: {
    companyId: string;
    conversationId: string;
  }): Promise<{ quoteId: string } | null>;

  loadLatestSendAttempt(input: {
    companyId: string;
    quoteId: string;
  }): Promise<QuoteSendAttemptSnapshot | null>;

  writeAiSendRequest(input: {
    companyId: string;
    quoteId: string;
    userId: string;
    metadata: Record<string, unknown>;
    request: QuoteAiSendRequest;
  }): Promise<void>;
};

export type RequestSendQuoteResult =
  | {
      ok: true;
      alreadyPending: boolean;
      quoteId: string;
      quoteNumber: string;
      quoteStatus: string;
      deliveryState: QuoteDeliveryState;
      channel: QuoteSendChannelChoice;
      sent: false;
      message: string;
    }
  | {
      ok: false;
      status: "needs_data" | "denied" | "failed" | "already_sent";
      deliveryState: QuoteDeliveryState;
      sent: boolean;
      errorCode?: string;
      message: string;
    };

export type GetQuoteDeliveryStatusResult = {
  ok: boolean;
  quoteId: string | null;
  quoteNumber: string | null;
  quoteStatus: string | null;
  deliveryState: QuoteDeliveryState;
  sent: boolean;
  attemptStatus: QuoteSendAttemptSnapshot["status"] | null;
  sendRequestStatus: QuoteAiSendRequest["status"] | null;
  channel: QuoteSendChannelChoice | null;
  errorCode: string | null;
  message: string;
};

function mergeMetadata(
  existing: Record<string, unknown>,
  request: QuoteAiSendRequest,
): Record<string, unknown> {
  return {
    ...existing,
    [AI_SEND_REQUEST_METADATA_KEY]: request,
  };
}

export async function requestSendQuote(
  deps: QuoteDeliveryCommandDeps,
  input: {
    companyId: string;
    userId: string;
    conversationId: string;
    quoteId?: string;
    channel?: QuoteSendChannelChoice;
  },
): Promise<RequestSendQuoteResult> {
  const companyId = input.companyId.trim();
  const userId = input.userId.trim();
  const conversationId = input.conversationId.trim();
  const channel: QuoteSendChannelChoice = input.channel === "whatsapp" ? "whatsapp" : "email";

  let quoteId = input.quoteId?.trim() || "";
  if (!quoteId) {
    const found = await deps.findLatestDraftQuoteForConversation({ companyId, conversationId });
    if (!found) {
      return {
        ok: false,
        status: "needs_data",
        deliveryState: "draft",
        sent: false,
        message:
          "No draft quote found for this conversation. Create an internal draft first, then request send for human approval.",
      };
    }
    quoteId = found.quoteId;
  }

  const quote = await deps.loadQuoteForCompany({ companyId, quoteId });
  if (!quote) {
    return {
      ok: false,
      status: "denied",
      deliveryState: "draft",
      sent: false,
      errorCode: "QUOTE_NOT_FOUND",
      message: "Quote not found in this company.",
    };
  }
  if (quote.companyId !== companyId) {
    return {
      ok: false,
      status: "denied",
      deliveryState: "draft",
      sent: false,
      errorCode: "COMPANY_MISMATCH",
      message: "Quote belongs to another company.",
    };
  }

  const latestAttempt = await deps.loadLatestSendAttempt({ companyId, quoteId });
  const existingRequest = readAiSendRequest(quote.metadata);
  const resolved = resolveQuoteDeliveryState({
    quoteStatus: quote.status,
    latestAttempt,
    sendRequest: existingRequest,
  });

  if (resolved.sent) {
    return {
      ok: false,
      status: "already_sent",
      deliveryState: "sent",
      sent: true,
      errorCode: "ALREADY_SENT",
      message: `Quote ${quote.quoteNumber} was already sent. Do not claim a new send.`,
    };
  }

  if (quote.lineCount < 1) {
    return {
      ok: false,
      status: "needs_data",
      deliveryState: resolved.deliveryState,
      sent: false,
      message: "Quote has no line items. A teammate must complete the draft before send can be requested.",
    };
  }

  if (quote.status !== "draft" && quote.status !== "internal_review") {
    return {
      ok: false,
      status: "denied",
      deliveryState: resolved.deliveryState,
      sent: false,
      errorCode: "INVALID_STATUS",
      message: `Quote ${quote.quoteNumber} is ${quote.status} and cannot be queued for send.`,
    };
  }

  if (existingRequest?.status === "pending_human_approval") {
    return {
      ok: true,
      alreadyPending: true,
      quoteId: quote.quoteId,
      quoteNumber: quote.quoteNumber,
      quoteStatus: quote.status,
      deliveryState: "pending_human_approval",
      channel: existingRequest.channel,
      sent: false,
      message:
        "A human send approval is already pending for this quote. It was NOT sent to the customer.",
    };
  }

  if (latestAttempt?.status === "pending") {
    return {
      ok: false,
      status: "failed",
      deliveryState: "sending",
      sent: false,
      errorCode: "SEND_IN_PROGRESS",
      message: "A send attempt is already in progress. Wait, then check delivery status.",
    };
  }

  const request: QuoteAiSendRequest = {
    status: "pending_human_approval",
    channel,
    requestedAt: new Date().toISOString(),
    requestedByUserId: userId,
    conversationId,
    resolvedAt: null,
    resolvedByUserId: null,
    attemptId: null,
    errorCode: null,
  };

  try {
    await deps.writeAiSendRequest({
      companyId,
      quoteId: quote.quoteId,
      userId,
      metadata: mergeMetadata(quote.metadata, request),
      request,
    });
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      deliveryState: resolved.deliveryState,
      sent: false,
      errorCode: "WRITE_FAILED",
      message: error instanceof Error ? error.message : "Failed to store send request.",
    };
  }

  return {
    ok: true,
    alreadyPending: false,
    quoteId: quote.quoteId,
    quoteNumber: quote.quoteNumber,
    quoteStatus: quote.status,
    deliveryState: "pending_human_approval",
    channel,
    sent: false,
    message:
      "Send request queued for human approval. The quote was NOT sent. A teammate with quotes.send must approve and deliver via the existing send service.",
  };
}

export async function getQuoteDeliveryStatus(
  deps: QuoteDeliveryCommandDeps,
  input: {
    companyId: string;
    conversationId: string;
    quoteId?: string;
  },
): Promise<GetQuoteDeliveryStatusResult> {
  const companyId = input.companyId.trim();
  const conversationId = input.conversationId.trim();
  let quoteId = input.quoteId?.trim() || "";
  if (!quoteId) {
    const found = await deps.findLatestDraftQuoteForConversation({ companyId, conversationId });
    if (!found) {
      // Also allow status for already-sent quotes linked via conversation request metadata — fall through
      return {
        ok: false,
        quoteId: null,
        quoteNumber: null,
        quoteStatus: null,
        deliveryState: "draft",
        sent: false,
        attemptStatus: null,
        sendRequestStatus: null,
        channel: null,
        errorCode: "QUOTE_NOT_FOUND",
        message: "No quote found for this conversation.",
      };
    }
    quoteId = found.quoteId;
  }

  const quote = await deps.loadQuoteForCompany({ companyId, quoteId });
  if (!quote || quote.companyId !== companyId) {
    return {
      ok: false,
      quoteId: quoteId || null,
      quoteNumber: null,
      quoteStatus: null,
      deliveryState: "draft",
      sent: false,
      attemptStatus: null,
      sendRequestStatus: null,
      channel: null,
      errorCode: "QUOTE_NOT_FOUND",
      message: "Quote not found in this company.",
    };
  }

  const latestAttempt = await deps.loadLatestSendAttempt({ companyId, quoteId });
  const sendRequest = readAiSendRequest(quote.metadata);
  const resolved = resolveQuoteDeliveryState({
    quoteStatus: quote.status,
    latestAttempt,
    sendRequest,
  });

  const message = resolved.sent
    ? `Quote ${quote.quoteNumber} delivery state is sent (from quote/attempt records).`
    : resolved.deliveryState === "pending_human_approval"
      ? `Quote ${quote.quoteNumber} awaits human send approval. It is NOT sent.`
      : resolved.deliveryState === "failed"
        ? `Quote ${quote.quoteNumber} send failed. It is NOT marked sent.`
        : resolved.deliveryState === "sending"
          ? `Quote ${quote.quoteNumber} send is in progress. Do not claim delivery yet.`
          : `Quote ${quote.quoteNumber} is still an internal draft. It is NOT sent.`;

  return {
    ok: true,
    quoteId: quote.quoteId,
    quoteNumber: quote.quoteNumber,
    quoteStatus: quote.status,
    deliveryState: resolved.deliveryState,
    sent: resolved.sent,
    attemptStatus: resolved.attemptStatus,
    sendRequestStatus: resolved.sendRequestStatus,
    channel: sendRequest?.channel ?? (latestAttempt?.channel === "whatsapp" ? "whatsapp" : latestAttempt?.channel === "email" ? "email" : null),
    errorCode: latestAttempt?.errorCode ?? sendRequest?.errorCode ?? null,
    message,
  };
}
