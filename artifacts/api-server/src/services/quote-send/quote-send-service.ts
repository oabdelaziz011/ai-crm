/**
 * Quote sending through existing platform channels.
 *
 * - Email → Email Workspace conversation + ChannelDispatcher (EmailCloudAdapter / SMTP).
 * - WhatsApp → existing WhatsApp conversation session + ChannelDispatcher (WhatsAppCloudAdapter).
 *
 * Every attempt is recorded in quote_send_attempts (pending → sent | failed). The quote is moved
 * to "sent" through QuoteCommandService.changeStatus only after the provider accepted the message.
 */
import {
  normalizeQuoteSendLanguage,
  buildQuoteEmailSubject,
  renderQuoteEmailHtml,
  renderQuoteEmailText,
  renderQuoteWhatsAppText,
  type QuoteRenderInput,
  type QuoteSendLanguage,
} from "./quote-send-render.js";

export const QUOTE_SEND_CHANNELS = ["email", "whatsapp"] as const;
export type QuoteSendChannel = (typeof QUOTE_SEND_CHANNELS)[number];

/** Pending attempts older than this are considered abandoned (process crash) and closed as failed. */
export const QUOTE_SEND_STALE_PENDING_MS = 5 * 60 * 1000;
/** Meta customer-service window for free-form WhatsApp messages. */
export const WHATSAPP_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type QuoteSendUnavailableReason =
  | "not_entitled"
  | "no_email_channel"
  | "no_recipient_email"
  | "no_whatsapp_channel"
  | "no_recipient_phone"
  | "no_whatsapp_conversation"
  | "whatsapp_window_closed";

export class QuoteSendError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "QuoteSendError";
  }
}

export type QuoteSnapshot = {
  id: string;
  companyId: string;
  quoteNumber: string;
  title: string;
  status: string;
  currency: string;
  language: string;
  contactName: string;
  validUntil: string | null;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  shippingTotal: number;
  grandTotal: number;
  notes: string;
  customerId: string | null;
  opportunityId: string | null;
  createdAt: string;
  lines: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    taxAmount: number;
    total: number;
    isOptional: boolean;
  }>;
};

export type QuoteRecipient = {
  customerId: string | null;
  leadId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
};

export type QuoteCompanyIdentity = {
  name: string;
  logoUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

export type EmailChannelRoute = { companyChannelId: string; fromEmail: string | null };

export type WhatsAppRouteResolution =
  | {
      ok: true;
      companyChannelId: string;
      conversationId: string;
      channelSessionId: string;
      externalThreadId: string;
    }
  | { ok: false; reason: "no_whatsapp_channel" | "no_whatsapp_conversation" | "whatsapp_window_closed" };

export type QuoteSendAttempt = {
  id: string;
  quoteId: string;
  channel: QuoteSendChannel;
  status: "pending" | "sent" | "failed";
  recipient: string | null;
  conversationId: string | null;
  externalMessageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export type DispatchInput = {
  companyId: string;
  conversationId: string;
  companyChannelId: string;
  channelKey: QuoteSendChannel;
  channelSessionId: string;
  externalThreadId: string;
  text: string;
  metadata: Record<string, unknown>;
};

export type DispatchResult = {
  deliveryEventId: string | null;
  externalMessageId: string | null;
  deliveryStatus: string;
};

export interface QuoteSendPorts {
  loadQuote(companyId: string, quoteId: string): Promise<QuoteSnapshot | null>;
  loadCompanyIdentity(companyId: string): Promise<QuoteCompanyIdentity>;
  resolveRecipient(companyId: string, quote: QuoteSnapshot): Promise<QuoteRecipient>;
  isChannelEntitled(companyId: string, channel: QuoteSendChannel): Promise<boolean>;
  findEmailChannel(companyId: string): Promise<EmailChannelRoute | null>;
  resolveWhatsAppRoute(
    companyId: string,
    recipient: QuoteRecipient,
    now: Date,
  ): Promise<WhatsAppRouteResolution>;

  findAttemptByKey(companyId: string, idempotencyKey: string): Promise<QuoteSendAttempt | null>;
  closeStalePendingAttempts(companyId: string, quoteId: string, olderThan: Date): Promise<void>;
  /** Returns null when another attempt for the quote is already pending (unique partial index). */
  createPendingAttempt(input: {
    companyId: string;
    quoteId: string;
    channel: QuoteSendChannel;
    idempotencyKey: string;
    recipient: string;
    actorUserId: string | null;
  }): Promise<{ attempt: QuoteSendAttempt } | { conflict: "pending_exists" | "duplicate_key" }>;
  completeAttempt(
    attemptId: string,
    patch: {
      status: "sent" | "failed";
      companyChannelId?: string | null;
      conversationId?: string | null;
      deliveryEventId?: string | null;
      externalMessageId?: string | null;
      errorCode?: string | null;
      errorMessage?: string | null;
    },
  ): Promise<void>;

  createEmailConversation(input: {
    companyId: string;
    companyChannelId: string;
    fromEmail: string | null;
    subject: string;
    quoteId: string;
    recipient: QuoteRecipient;
  }): Promise<{ conversationId: string; channelSessionId: string; externalThreadId: string }>;
  dispatch(input: DispatchInput): Promise<DispatchResult>;

  /** QuoteCommandService.changeStatus(…, "sent") — existing sent semantics, history, opportunity history. */
  markQuoteSent(companyId: string, quoteId: string): Promise<{ status: string; sentAt: string | null }>;
  addQuoteHistory(input: {
    companyId: string;
    quoteId: string;
    eventType: "quote_send_succeeded" | "quote_send_failed";
    summary: string;
    payload: Record<string, unknown>;
    actorUserId: string | null;
  }): Promise<void>;
}

export type QuoteChannelOption = {
  channel: QuoteSendChannel;
  available: boolean;
  reason: QuoteSendUnavailableReason | null;
  recipient: string | null;
};

export type QuoteSendResult = {
  attemptId: string;
  channel: QuoteSendChannel;
  status: "sent";
  recipient: string | null;
  conversationId: string | null;
  externalMessageId: string | null;
  quoteStatus: string | null;
  sentAt: string | null;
  quoteStatusUpdated: boolean;
  replayed: boolean;
};

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9:_-]{8,200}$/;

export function isQuoteSendChannel(value: unknown): value is QuoteSendChannel {
  return typeof value === "string" && (QUOTE_SEND_CHANNELS as readonly string[]).includes(value);
}

function errorMessageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.slice(0, 1000);
  return "Quote could not be sent.";
}

function errorCodeOf(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" && code.trim() ? code.trim().slice(0, 100) : "send_failed";
}

const EXPOSABLE_ERROR_NAMES = new Set([
  "HttpError",
  "QuoteSendError",
  "ValidationError",
  "DeliveryFailedError",
  "PermissionDeniedError",
  "CompanyChannelNotFoundError",
]);

/** Provider/validation errors are actionable; unknown internal errors stay generic in responses. */
function publicErrorMessageOf(error: unknown): string {
  const name = (error as { name?: unknown })?.name;
  if (typeof name === "string" && EXPOSABLE_ERROR_NAMES.has(name)) return errorMessageOf(error);
  return "The quote could not be delivered. Please try again.";
}

function errorStatusOf(error: unknown): number {
  const status = (error as { status?: unknown; statusCode?: unknown })?.status ??
    (error as { statusCode?: unknown })?.statusCode;
  return typeof status === "number" && status >= 400 && status < 600 ? status : 502;
}

export class QuoteSendService {
  constructor(
    private readonly ports: QuoteSendPorts,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async loadQuoteOrThrow(companyId: string, quoteId: string): Promise<QuoteSnapshot> {
    const quote = await this.ports.loadQuote(companyId, quoteId);
    if (!quote || quote.companyId !== companyId) {
      throw new QuoteSendError(404, "quote_not_found", "Quote not found.");
    }
    return quote;
  }

  private async evaluateChannel(
    companyId: string,
    channel: QuoteSendChannel,
    recipient: QuoteRecipient,
  ): Promise<
    | { available: true; recipient: string; email?: EmailChannelRoute; whatsapp?: Extract<WhatsAppRouteResolution, { ok: true }> }
    | { available: false; reason: QuoteSendUnavailableReason; recipient: string | null }
  > {
    if (!(await this.ports.isChannelEntitled(companyId, channel))) {
      return { available: false, reason: "not_entitled", recipient: null };
    }
    if (channel === "email") {
      const email = recipient.email?.trim() || null;
      const route = await this.ports.findEmailChannel(companyId);
      if (!route) return { available: false, reason: "no_email_channel", recipient: email };
      if (!email) return { available: false, reason: "no_recipient_email", recipient: null };
      return { available: true, recipient: email, email: route };
    }
    const phone = recipient.phone?.trim() || null;
    const resolution = await this.ports.resolveWhatsAppRoute(companyId, recipient, this.clock());
    if (!resolution.ok) {
      if (resolution.reason === "no_whatsapp_channel") {
        return { available: false, reason: "no_whatsapp_channel", recipient: phone };
      }
      if (!phone && resolution.reason === "no_whatsapp_conversation") {
        return { available: false, reason: "no_recipient_phone", recipient: null };
      }
      return { available: false, reason: resolution.reason, recipient: phone };
    }
    return { available: true, recipient: phone ?? resolution.externalThreadId, whatsapp: resolution };
  }

  async getSendOptions(input: { companyId: string; quoteId: string }): Promise<{
    quoteId: string;
    quoteStatus: string;
    hasLines: boolean;
    channels: QuoteChannelOption[];
  }> {
    const quote = await this.loadQuoteOrThrow(input.companyId, input.quoteId);
    const recipient = await this.ports.resolveRecipient(input.companyId, quote);
    const channels: QuoteChannelOption[] = [];
    for (const channel of QUOTE_SEND_CHANNELS) {
      const evaluation = await this.evaluateChannel(input.companyId, channel, recipient);
      channels.push(
        evaluation.available
          ? { channel, available: true, reason: null, recipient: evaluation.recipient }
          : { channel, available: false, reason: evaluation.reason, recipient: evaluation.recipient },
      );
    }
    return {
      quoteId: quote.id,
      quoteStatus: quote.status,
      hasLines: quote.lines.length > 0,
      channels,
    };
  }

  async send(input: {
    companyId: string;
    quoteId: string;
    channel: unknown;
    idempotencyKey: unknown;
    language?: unknown;
    actorUserId: string | null;
  }): Promise<QuoteSendResult> {
    if (!isQuoteSendChannel(input.channel)) {
      throw new QuoteSendError(400, "invalid_channel", "channel must be email or whatsapp.");
    }
    const channel = input.channel;
    const idempotencyKey = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
    if (!IDEMPOTENCY_KEY_RE.test(idempotencyKey)) {
      throw new QuoteSendError(400, "invalid_idempotency_key", "A valid idempotencyKey is required.");
    }

    const replay = await this.replayByKey(input.companyId, input.quoteId, channel, idempotencyKey);
    if (replay) return replay;

    const quote = await this.loadQuoteOrThrow(input.companyId, input.quoteId);
    if (quote.lines.length === 0) {
      throw new QuoteSendError(422, "quote_has_no_lines", "Add at least one line item before sending the quote.");
    }

    const recipient = await this.ports.resolveRecipient(input.companyId, quote);
    const evaluation = await this.evaluateChannel(input.companyId, channel, recipient);
    if (!evaluation.available) {
      throw new QuoteSendError(409, `channel_unavailable:${evaluation.reason}`, unavailableMessage(evaluation.reason), {
        reason: evaluation.reason,
        channel,
      });
    }

    await this.ports.closeStalePendingAttempts(
      input.companyId,
      quote.id,
      new Date(this.clock().getTime() - QUOTE_SEND_STALE_PENDING_MS),
    );

    const created = await this.ports.createPendingAttempt({
      companyId: input.companyId,
      quoteId: quote.id,
      channel,
      idempotencyKey,
      recipient: evaluation.recipient,
      actorUserId: input.actorUserId,
    });
    if ("conflict" in created) {
      if (created.conflict === "duplicate_key") {
        const raced = await this.replayByKey(input.companyId, input.quoteId, channel, idempotencyKey);
        if (raced) return raced;
      }
      throw new QuoteSendError(409, "send_in_progress", "This quote is already being sent. Wait a moment, then refresh.");
    }
    const attempt = created.attempt;

    const company = await this.ports.loadCompanyIdentity(input.companyId);
    const renderInput: QuoteRenderInput = {
      language: normalizeQuoteSendLanguage(input.language ?? quote.language),
      company,
      quote: {
        quoteNumber: quote.quoteNumber,
        title: quote.title,
        currency: quote.currency,
        issuedAt: quote.createdAt,
        validUntil: quote.validUntil,
        subtotal: quote.subtotal,
        discountTotal: quote.discountTotal,
        taxTotal: quote.taxTotal,
        shippingTotal: quote.shippingTotal,
        grandTotal: quote.grandTotal,
        notes: quote.notes,
      },
      customerName: quote.contactName.trim() || recipient.name.trim(),
      lines: quote.lines,
    };

    let conversationId: string | null = null;
    let companyChannelId: string | null = null;
    let dispatched: DispatchResult;
    try {
      if (channel === "email") {
        const route = evaluation.email!;
        companyChannelId = route.companyChannelId;
        const subject = buildQuoteEmailSubject(renderInput);
        const conversation = await this.ports.createEmailConversation({
          companyId: input.companyId,
          companyChannelId: route.companyChannelId,
          fromEmail: route.fromEmail,
          subject,
          quoteId: quote.id,
          recipient,
        });
        conversationId = conversation.conversationId;
        dispatched = await this.ports.dispatch({
          companyId: input.companyId,
          conversationId: conversation.conversationId,
          companyChannelId: route.companyChannelId,
          channelKey: "email",
          channelSessionId: conversation.channelSessionId,
          externalThreadId: conversation.externalThreadId,
          text: renderQuoteEmailText(renderInput),
          metadata: {
            recipientEmail: evaluation.recipient,
            emailSubject: subject,
            htmlSanitized: renderQuoteEmailHtml(renderInput),
            emailComposerMode: "compose",
            source: "quote_send",
            quoteId: quote.id,
            quoteSendAttemptId: attempt.id,
          },
        });
      } else {
        const route = evaluation.whatsapp!;
        companyChannelId = route.companyChannelId;
        conversationId = route.conversationId;
        dispatched = await this.ports.dispatch({
          companyId: input.companyId,
          conversationId: route.conversationId,
          companyChannelId: route.companyChannelId,
          channelKey: "whatsapp",
          channelSessionId: route.channelSessionId,
          externalThreadId: route.externalThreadId,
          text: renderQuoteWhatsAppText(renderInput),
          metadata: {
            source: "quote_send",
            quoteId: quote.id,
            quoteSendAttemptId: attempt.id,
          },
        });
      }
    } catch (error) {
      await this.recordFailure({
        companyId: input.companyId,
        quote,
        attemptId: attempt.id,
        channel,
        recipient: evaluation.recipient,
        companyChannelId,
        conversationId,
        error,
        actorUserId: input.actorUserId,
      });
      throw new QuoteSendError(errorStatusOf(error), errorCodeOf(error), publicErrorMessageOf(error), {
        attemptId: attempt.id,
        channel,
      });
    }

    await this.ports.completeAttempt(attempt.id, {
      status: "sent",
      companyChannelId,
      conversationId,
      deliveryEventId: dispatched.deliveryEventId,
      externalMessageId: dispatched.externalMessageId,
    });
    await this.ports
      .addQuoteHistory({
        companyId: input.companyId,
        quoteId: quote.id,
        eventType: "quote_send_succeeded",
        summary: `Quote ${quote.quoteNumber} sent via ${channel} to ${evaluation.recipient}`,
        payload: {
          attemptId: attempt.id,
          channel,
          recipient: evaluation.recipient,
          conversationId,
          deliveryEventId: dispatched.deliveryEventId,
          externalMessageId: dispatched.externalMessageId,
          deliveryStatus: dispatched.deliveryStatus,
        },
        actorUserId: input.actorUserId,
      })
      .catch((error) => console.error("[quote-send] success history failed", { attemptId: attempt.id, error }));

    let quoteStatus: string | null = null;
    let sentAt: string | null = null;
    let quoteStatusUpdated = false;
    try {
      const marked = await this.ports.markQuoteSent(input.companyId, quote.id);
      quoteStatus = marked.status;
      sentAt = marked.sentAt;
      quoteStatusUpdated = true;
    } catch (error) {
      // Message was delivered to the provider; the attempt stays "sent". Status can be fixed by a retry.
      console.error("[quote-send] message sent but quote status update failed", {
        attemptId: attempt.id,
        quoteId: quote.id,
        error,
      });
    }

    return {
      attemptId: attempt.id,
      channel,
      status: "sent",
      recipient: evaluation.recipient,
      conversationId,
      externalMessageId: dispatched.externalMessageId,
      quoteStatus,
      sentAt,
      quoteStatusUpdated,
      replayed: false,
    };
  }

  private async replayByKey(
    companyId: string,
    quoteId: string,
    channel: QuoteSendChannel,
    idempotencyKey: string,
  ): Promise<QuoteSendResult | null> {
    const existing = await this.ports.findAttemptByKey(companyId, idempotencyKey);
    if (!existing) return null;
    if (existing.quoteId !== quoteId || existing.channel !== channel) {
      throw new QuoteSendError(409, "idempotency_key_reused", "This send request key was already used for a different send.");
    }
    if (existing.status === "pending") {
      throw new QuoteSendError(409, "send_in_progress", "This quote is already being sent. Wait a moment, then refresh.", {
        attemptId: existing.id,
      });
    }
    if (existing.status === "failed") {
      throw new QuoteSendError(
        409,
        "send_attempt_failed",
        "This send attempt already failed. Send again to retry.",
        { attemptId: existing.id, channel, replayed: true, errorCode: existing.errorCode },
      );
    }
    return {
      attemptId: existing.id,
      channel,
      status: "sent",
      recipient: existing.recipient,
      conversationId: existing.conversationId,
      externalMessageId: existing.externalMessageId,
      quoteStatus: null,
      sentAt: null,
      quoteStatusUpdated: false,
      replayed: true,
    };
  }

  private async recordFailure(input: {
    companyId: string;
    quote: QuoteSnapshot;
    attemptId: string;
    channel: QuoteSendChannel;
    recipient: string;
    companyChannelId: string | null;
    conversationId: string | null;
    error: unknown;
    actorUserId: string | null;
  }): Promise<void> {
    const errorCode = errorCodeOf(input.error);
    const errorMessage = errorMessageOf(input.error);
    try {
      await this.ports.completeAttempt(input.attemptId, {
        status: "failed",
        companyChannelId: input.companyChannelId,
        conversationId: input.conversationId,
        errorCode,
        errorMessage,
      });
    } catch (error) {
      console.error("[quote-send] could not close failed attempt", { attemptId: input.attemptId, error });
    }
    await this.ports
      .addQuoteHistory({
        companyId: input.companyId,
        quoteId: input.quote.id,
        eventType: "quote_send_failed",
        summary: `Sending quote ${input.quote.quoteNumber} via ${input.channel} failed: ${errorMessage}`,
        payload: {
          attemptId: input.attemptId,
          channel: input.channel,
          recipient: input.recipient,
          conversationId: input.conversationId,
          errorCode,
        },
        actorUserId: input.actorUserId,
      })
      .catch((error) => console.error("[quote-send] failure history failed", { attemptId: input.attemptId, error }));
  }
}

export function unavailableMessage(reason: QuoteSendUnavailableReason): string {
  switch (reason) {
    case "not_entitled":
      return "This channel is not included in your plan.";
    case "no_email_channel":
      return "Connect a company email channel in Channels settings before sending quotes by email.";
    case "no_recipient_email":
      return "The customer has no email address. Add one to the customer or lead, then try again.";
    case "no_whatsapp_channel":
      return "Connect WhatsApp in Channels settings before sending quotes by WhatsApp.";
    case "no_recipient_phone":
      return "The customer has no WhatsApp conversation or phone number.";
    case "no_whatsapp_conversation":
      return "The customer has not messaged you on WhatsApp yet. WhatsApp only allows sending after the customer starts a conversation.";
    case "whatsapp_window_closed":
      return "The customer's last WhatsApp message is older than 24 hours. WhatsApp only allows free-form messages within 24 hours of the customer's last message.";
  }
}

export type { QuoteSendLanguage };
