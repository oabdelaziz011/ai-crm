/**
 * Human approval for AI quote send requests.
 * Approve → existing QuoteSendService only (no parallel dispatcher).
 */

import {
  AI_SEND_REQUEST_METADATA_KEY,
  readAiSendRequest,
  type QuoteAiSendRequest,
} from "@workspace/ai-tool-router";
import {
  QuoteSendError,
  QuoteSendService,
  type QuoteSendChannel,
  type QuoteSendResult,
} from "./quote-send-service.js";

export type QuoteSendApprovalPorts = {
  listPendingSendRequests(companyId: string): Promise<
    Array<{
      quoteId: string;
      quoteNumber: string;
      status: string;
      title: string;
      contactName: string;
      grandTotal: number;
      currency: string;
      metadata: Record<string, unknown>;
    }>
  >;
  loadQuoteMetadata(
    companyId: string,
    quoteId: string,
  ): Promise<{ metadata: Record<string, unknown>; status: string; quoteNumber: string } | null>;
  writeQuoteMetadata(input: {
    companyId: string;
    quoteId: string;
    actorUserId: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
  /**
   * CAS: pending_human_approval → sending. Returns false when another approver already claimed.
   */
  claimPendingSendRequest(input: {
    companyId: string;
    quoteId: string;
    actorUserId: string;
    metadata: Record<string, unknown>;
  }): Promise<boolean>;
  /**
   * CAS reclaim: stale sending → sending (same actor metadata). Used when a prior approve
   * crashed after claim and left the request stuck without a delivered quote.
   */
  reclaimStaleSendingRequest(input: {
    companyId: string;
    quoteId: string;
    actorUserId: string;
    metadata: Record<string, unknown>;
    staleBefore: Date;
  }): Promise<boolean>;
};

/** Requests stuck in sending longer than this may be reclaimed for a safe retry. */
export const QUOTE_SEND_APPROVAL_STALE_SENDING_MS = 60_000;

export type PendingQuoteSendRequestItem = {
  quoteId: string;
  quoteNumber: string;
  quoteStatus: string;
  title: string;
  contactName: string;
  grandTotal: number;
  currency: string;
  channel: QuoteSendChannel;
  requestedAt: string;
  requestedByUserId: string;
  conversationId: string | null;
  /** Always pending_human_approval for list items; never claim sent from request alone. */
  deliveryState: "pending_human_approval";
  sent: false;
};

function withRequest(
  metadata: Record<string, unknown>,
  request: QuoteAiSendRequest,
): Record<string, unknown> {
  return { ...metadata, [AI_SEND_REQUEST_METADATA_KEY]: request };
}

export class QuoteSendApprovalService {
  constructor(
    private readonly ports: QuoteSendApprovalPorts,
    private readonly sendService: QuoteSendService,
  ) {}

  async listPending(companyId: string): Promise<PendingQuoteSendRequestItem[]> {
    const rows = await this.ports.listPendingSendRequests(companyId);
    const items: PendingQuoteSendRequestItem[] = [];
    for (const row of rows) {
      const request = readAiSendRequest(row.metadata);
      if (!request || request.status !== "pending_human_approval") continue;
      items.push({
        quoteId: row.quoteId,
        quoteNumber: row.quoteNumber,
        quoteStatus: row.status,
        title: row.title,
        contactName: row.contactName,
        grandTotal: row.grandTotal,
        currency: row.currency,
        channel: request.channel,
        requestedAt: request.requestedAt,
        requestedByUserId: request.requestedByUserId,
        conversationId: request.conversationId,
        deliveryState: "pending_human_approval",
        sent: false,
      });
    }
    return items;
  }

  async reject(input: {
    companyId: string;
    quoteId: string;
    actorUserId: string;
  }): Promise<{ quoteId: string; deliveryState: "draft"; sent: false }> {
    const quote = await this.ports.loadQuoteMetadata(input.companyId, input.quoteId);
    if (!quote) throw new QuoteSendError(404, "quote_not_found", "Quote not found.");
    const request = readAiSendRequest(quote.metadata);
    // Allow clearing stuck "sending" (crashed approve) as well as normal pending.
    if (
      !request ||
      (request.status !== "pending_human_approval" && request.status !== "sending")
    ) {
      throw new QuoteSendError(409, "no_pending_send_request", "No pending AI send request for this quote.");
    }
    const resolved: QuoteAiSendRequest = {
      ...request,
      status: "rejected",
      resolvedAt: new Date().toISOString(),
      resolvedByUserId: input.actorUserId,
    };
    await this.ports.writeQuoteMetadata({
      companyId: input.companyId,
      quoteId: input.quoteId,
      actorUserId: input.actorUserId,
      metadata: withRequest(quote.metadata, resolved),
    });
    return { quoteId: input.quoteId, deliveryState: "draft", sent: false };
  }

  /**
   * Explicit human approval: delivers only through QuoteSendService under quotes.send.
   */
  async approveAndSend(input: {
    companyId: string;
    quoteId: string;
    actorUserId: string;
    channel?: QuoteSendChannel;
    idempotencyKey?: string;
    language?: string;
  }): Promise<QuoteSendResult & { deliveryState: "sent" | "failed"; sent: boolean }> {
    const quote = await this.ports.loadQuoteMetadata(input.companyId, input.quoteId);
    if (!quote) throw new QuoteSendError(404, "quote_not_found", "Quote not found.");
    const request = readAiSendRequest(quote.metadata);
    if (
      !request ||
      (request.status !== "pending_human_approval" && request.status !== "sending")
    ) {
      throw new QuoteSendError(409, "no_pending_send_request", "No pending AI send request for this quote.");
    }
    if (quote.status === "sent") {
      throw new QuoteSendError(409, "already_sent", "Quote was already sent.");
    }

    const channel = input.channel ?? request.channel;
    const claiming: QuoteAiSendRequest = {
      ...request,
      status: "sending",
      channel,
      resolvedAt: null,
      resolvedByUserId: input.actorUserId,
      attemptId: null,
      errorCode: null,
    };
    const claimMeta = withRequest(quote.metadata, claiming);
    let claimed = false;
    if (request.status === "pending_human_approval") {
      claimed = await this.ports.claimPendingSendRequest({
        companyId: input.companyId,
        quoteId: input.quoteId,
        actorUserId: input.actorUserId,
        metadata: claimMeta,
      });
    } else {
      claimed = await this.ports.reclaimStaleSendingRequest({
        companyId: input.companyId,
        quoteId: input.quoteId,
        actorUserId: input.actorUserId,
        metadata: claimMeta,
        staleBefore: new Date(Date.now() - QUOTE_SEND_APPROVAL_STALE_SENDING_MS),
      });
    }
    if (!claimed) {
      throw new QuoteSendError(
        409,
        "send_in_progress",
        "This quote send request is already being approved. Wait a moment, then refresh.",
      );
    }

    try {
      const result = await this.sendService.send({
        companyId: input.companyId,
        quoteId: input.quoteId,
        channel,
        idempotencyKey: input.idempotencyKey,
        language: input.language,
        actorUserId: input.actorUserId,
      });

      const resolved: QuoteAiSendRequest = {
        ...claiming,
        status: "approved_sent",
        resolvedAt: new Date().toISOString(),
        resolvedByUserId: input.actorUserId,
        attemptId: result.attemptId,
        errorCode: null,
      };
      await this.ports
        .writeQuoteMetadata({
          companyId: input.companyId,
          quoteId: input.quoteId,
          actorUserId: input.actorUserId,
          metadata: withRequest(quote.metadata, resolved),
        })
        .catch((error) =>
          console.error("[quote-send-approval] metadata update after send failed", error),
        );

      return {
        ...result,
        deliveryState: "sent",
        sent: true,
      };
    } catch (error) {
      const errorCode =
        error instanceof QuoteSendError
          ? error.code
          : error instanceof Error
            ? error.name
            : "send_failed";
      const attemptId =
        error instanceof QuoteSendError && typeof error.details?.attemptId === "string"
          ? error.details.attemptId
          : null;
      const resolved: QuoteAiSendRequest = {
        ...claiming,
        status: "approved_failed",
        resolvedAt: new Date().toISOString(),
        resolvedByUserId: input.actorUserId,
        attemptId,
        errorCode,
      };
      await this.ports
        .writeQuoteMetadata({
          companyId: input.companyId,
          quoteId: input.quoteId,
          actorUserId: input.actorUserId,
          metadata: withRequest(quote.metadata, resolved),
        })
        .catch((metaError) =>
          console.error("[quote-send-approval] metadata update after failure failed", metaError),
        );
      throw error;
    }
  }
}
