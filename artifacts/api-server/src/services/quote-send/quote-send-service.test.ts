import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  QuoteSendError,
  QuoteSendService,
  QUOTE_SEND_STALE_PENDING_MS,
  type DispatchInput,
  type QuoteRecipient,
  type QuoteSendAttempt,
  type QuoteSendPorts,
  type QuoteSnapshot,
  type WhatsAppRouteResolution,
} from "./quote-send-service.js";
import {
  QUOTE_SEND_DELEGATED_PERMISSIONS,
  QUOTE_SEND_PERMISSION,
  createQuoteSendDispatchContext,
} from "./quote-send-dispatch-context.js";
import { renderQuoteEmailHtml, renderQuoteWhatsAppText } from "./quote-send-render.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const OTHER_COMPANY = "22222222-2222-4222-8222-222222222222";
const QUOTE_ID = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-09-28T12:00:00.000Z");

function makeQuote(overrides: Partial<QuoteSnapshot> = {}): QuoteSnapshot {
  return {
    id: QUOTE_ID,
    companyId: COMPANY,
    quoteNumber: "Q-0042",
    title: "Office fit-out",
    status: "draft",
    currency: "USD",
    language: "en",
    contactName: "Mona Ali",
    validUntil: null,
    subtotal: 200,
    discountTotal: 0,
    taxTotal: 28,
    shippingTotal: 0,
    grandTotal: 228,
    notes: "",
    customerId: "cust-1",
    opportunityId: null,
    createdAt: "2026-09-20T10:00:00.000Z",
    lines: [
      { name: "Desk", quantity: 2, unitPrice: 100, discountAmount: 0, taxAmount: 28, total: 228, isOptional: false },
    ],
    ...overrides,
  };
}

type Harness = {
  ports: QuoteSendPorts;
  attempts: Array<QuoteSendAttempt & { companyId: string; idempotencyKey: string }>;
  dispatches: DispatchInput[];
  history: Array<{ eventType: string; payload: Record<string, unknown>; companyId: string }>;
  markedSent: string[];
  conversationsCreated: number;
  quote: QuoteSnapshot;
};

function createHarness(options: {
  quote?: QuoteSnapshot | null;
  recipient?: Partial<QuoteRecipient>;
  entitled?: boolean;
  emailChannel?: boolean;
  whatsapp?: WhatsAppRouteResolution;
  dispatchError?: Error;
  markSentError?: Error;
  completeAttemptError?: Error;
  dispatchDelayMs?: number;
} = {}): Harness {
  const quote = options.quote === undefined ? makeQuote() : options.quote;
  const h: Harness = {
    attempts: [],
    dispatches: [],
    history: [],
    markedSent: [],
    conversationsCreated: 0,
    quote: quote ?? makeQuote(),
    ports: undefined as unknown as QuoteSendPorts,
  };
  let seq = 0;
  h.ports = {
    async loadQuote(companyId, quoteId) {
      // Mirrors RLS + explicit company filter: quotes of another company are invisible.
      if (!quote || quote.companyId !== companyId || quote.id !== quoteId) return null;
      return quote;
    },
    async loadCompanyIdentity() {
      return { name: "Acme <Trading>", logoUrl: null, contactEmail: "sales@acme.test", contactPhone: null };
    },
    async resolveRecipient() {
      return {
        customerId: "cust-1",
        leadId: null,
        name: "Mona Ali",
        email: "mona@example.test",
        phone: "+201000000000",
        ...options.recipient,
      };
    },
    async isChannelEntitled() {
      return options.entitled ?? true;
    },
    async findEmailChannel() {
      return options.emailChannel === false ? null : { companyChannelId: "cc-email", fromEmail: "sales@acme.test" };
    },
    async resolveWhatsAppRoute() {
      return (
        options.whatsapp ?? {
          ok: true,
          companyChannelId: "cc-wa",
          conversationId: "conv-wa",
          channelSessionId: "sess-wa",
          externalThreadId: "201000000000",
        }
      );
    },
    async findAttemptByKey(companyId, key) {
      return h.attempts.find((a) => a.companyId === companyId && a.idempotencyKey === key) ?? null;
    },
    async closeStalePendingAttempts(companyId, quoteId, olderThan) {
      for (const a of h.attempts) {
        if (a.companyId === companyId && a.quoteId === quoteId && a.status === "pending" && new Date(a.createdAt) < olderThan) {
          a.status = "failed";
          a.errorCode = "stale_pending";
        }
      }
    },
    async createPendingAttempt(input) {
      if (h.attempts.some((a) => a.companyId === input.companyId && a.idempotencyKey === input.idempotencyKey)) {
        return { conflict: "duplicate_key" };
      }
      if (h.attempts.some((a) => a.quoteId === input.quoteId && a.status === "pending")) {
        return { conflict: "pending_exists" };
      }
      const attempt = {
        id: `att-${++seq}`,
        companyId: input.companyId,
        idempotencyKey: input.idempotencyKey,
        quoteId: input.quoteId,
        channel: input.channel,
        status: "pending" as const,
        recipient: input.recipient,
        conversationId: null,
        externalMessageId: null,
        errorCode: null,
        errorMessage: null,
        createdAt: NOW.toISOString(),
      };
      h.attempts.push(attempt);
      return { attempt };
    },
    async completeAttempt(id, patch) {
      if (options.completeAttemptError && patch.status === "sent") {
        throw options.completeAttemptError;
      }
      const a = h.attempts.find((x) => x.id === id)!;
      Object.assign(a, {
        status: patch.status,
        conversationId: patch.conversationId ?? a.conversationId,
        externalMessageId: patch.externalMessageId ?? a.externalMessageId,
        errorCode: patch.errorCode ?? null,
        errorMessage: patch.errorMessage ?? null,
      });
    },
    async createEmailConversation() {
      h.conversationsCreated += 1;
      return { conversationId: "conv-email", channelSessionId: "sess-email", externalThreadId: "conv-email" };
    },
    async dispatch(input) {
      if (options.dispatchDelayMs) await new Promise((r) => setTimeout(r, options.dispatchDelayMs));
      if (options.dispatchError) throw options.dispatchError;
      h.dispatches.push(input);
      return { deliveryEventId: "del-1", externalMessageId: "ext-1", deliveryStatus: "sent" };
    },
    async markQuoteSent(_companyId, quoteId) {
      if (options.markSentError) throw options.markSentError;
      h.markedSent.push(quoteId);
      return { status: "sent", sentAt: NOW.toISOString() };
    },
    async addQuoteHistory(input) {
      h.history.push({ eventType: input.eventType, payload: input.payload, companyId: input.companyId });
    },
  };
  return h;
}

function service(h: Harness) {
  return new QuoteSendService(h.ports, () => NOW);
}

function sendInput(overrides: Record<string, unknown> = {}) {
  return {
    companyId: COMPANY,
    quoteId: QUOTE_ID,
    channel: "email",
    idempotencyKey: "quote-send-key-0001",
    actorUserId: "user-1",
    ...overrides,
  };
}

function providerError(message: string): Error {
  const error = new Error(message) as Error & { code: string };
  error.name = "DeliveryFailedError";
  error.code = "provider_rejected";
  return error;
}

describe("QuoteSendService — email", () => {
  it("sends through the Email Workspace dispatcher and marks the quote sent", async () => {
    const h = createHarness();
    const result = await service(h).send(sendInput());

    assert.equal(result.status, "sent");
    assert.equal(result.channel, "email");
    assert.equal(result.recipient, "mona@example.test");
    assert.equal(result.quoteStatus, "sent");
    assert.equal(result.quoteStatusUpdated, true);
    assert.equal(result.replayed, false);
    assert.equal(h.conversationsCreated, 1);
    assert.equal(h.dispatches.length, 1);
    const d = h.dispatches[0]!;
    assert.equal(d.channelKey, "email");
    assert.equal(d.companyChannelId, "cc-email");
    assert.equal(d.metadata.recipientEmail, "mona@example.test");
    assert.equal(d.metadata.emailComposerMode, "compose");
    assert.equal(d.metadata.source, "quote_send");
    assert.match(String(d.metadata.emailSubject), /Q-0042/);
    const html = String(d.metadata.htmlSanitized);
    assert.match(html, /Q-0042/);
    assert.match(html, /Desk/);
    assert.match(html, /Acme &lt;Trading&gt;/);
    assert.doesNotMatch(html, /mailto:|wa\.me/);
    assert.deepEqual(h.markedSent, [QUOTE_ID]);
    assert.equal(h.attempts[0]!.status, "sent");
    assert.equal(h.attempts[0]!.externalMessageId, "ext-1");
  });

  it("records a failed attempt and never marks the quote sent when email delivery fails", async () => {
    const h = createHarness({ dispatchError: providerError("SMTP rejected recipient") });
    await assert.rejects(service(h).send(sendInput()), (error: unknown) => {
      assert.ok(error instanceof QuoteSendError);
      assert.equal(error.status, 502);
      assert.equal(error.code, "provider_rejected");
      assert.match(error.message, /SMTP rejected recipient/);
      assert.equal(error.details.attemptId, "att-1");
      return true;
    });
    assert.equal(h.attempts[0]!.status, "failed");
    assert.equal(h.attempts[0]!.errorCode, "provider_rejected");
    assert.deepEqual(h.markedSent, []);
    assert.equal(h.history.at(-1)?.eventType, "quote_send_failed");
  });

  it("hides unknown internal error details from the caller", async () => {
    const h = createHarness({ dispatchError: new Error("connect ECONNREFUSED 10.0.0.5:5432 password=x") });
    await assert.rejects(service(h).send(sendInput()), (error: unknown) => {
      assert.ok(error instanceof QuoteSendError);
      assert.doesNotMatch(error.message, /ECONNREFUSED|password/);
      return true;
    });
    assert.deepEqual(h.markedSent, []);
  });
});

describe("QuoteSendService — WhatsApp", () => {
  it("sends the quote text over the existing WhatsApp session and marks it sent", async () => {
    const h = createHarness();
    const result = await service(h).send(sendInput({ channel: "whatsapp" }));

    assert.equal(result.channel, "whatsapp");
    assert.equal(result.conversationId, "conv-wa");
    assert.equal(h.conversationsCreated, 0);
    const d = h.dispatches[0]!;
    assert.equal(d.channelKey, "whatsapp");
    assert.equal(d.channelSessionId, "sess-wa");
    assert.equal(d.externalThreadId, "201000000000");
    assert.match(d.text, /Q-0042/);
    assert.match(d.text, /228/);
    assert.doesNotMatch(d.text, /wa\.me/);
    assert.deepEqual(h.markedSent, [QUOTE_ID]);
  });

  it("records failure and keeps the quote status when WhatsApp delivery fails", async () => {
    const h = createHarness({ dispatchError: providerError("Meta rejected message") });
    await assert.rejects(service(h).send(sendInput({ channel: "whatsapp" })), QuoteSendError);
    assert.equal(h.attempts[0]!.status, "failed");
    assert.deepEqual(h.markedSent, []);
    assert.equal(h.history.at(-1)?.eventType, "quote_send_failed");
    assert.equal(h.history.at(-1)?.payload.channel, "whatsapp");
  });
});

describe("QuoteSendService — channel availability", () => {
  it("reports only available channels with actionable reasons", async () => {
    const h = createHarness({
      emailChannel: false,
      whatsapp: { ok: false, reason: "whatsapp_window_closed" },
    });
    const options = await service(h).getSendOptions({ companyId: COMPANY, quoteId: QUOTE_ID });
    assert.deepEqual(
      options.channels.map((c) => [c.channel, c.available, c.reason]),
      [
        ["email", false, "no_email_channel"],
        ["whatsapp", false, "whatsapp_window_closed"],
      ],
    );
  });

  it("rejects sending on an unavailable channel without creating an attempt", async () => {
    const h = createHarness({ recipient: { email: null } });
    await assert.rejects(service(h).send(sendInput()), (error: unknown) => {
      assert.ok(error instanceof QuoteSendError);
      assert.equal(error.status, 409);
      assert.equal(error.code, "channel_unavailable:no_recipient_email");
      assert.match(error.message, /no email address/);
      return true;
    });
    assert.equal(h.attempts.length, 0);
    assert.equal(h.dispatches.length, 0);
  });

  it("treats a channel outside the company plan as unavailable", async () => {
    const h = createHarness({ entitled: false });
    await assert.rejects(service(h).send(sendInput({ channel: "whatsapp" })), /not included in your plan/);
    assert.equal(h.dispatches.length, 0);
  });

  it("refuses to send a quote without line items", async () => {
    const h = createHarness({ quote: makeQuote({ lines: [] }) });
    await assert.rejects(service(h).send(sendInput()), (error: unknown) => {
      assert.ok(error instanceof QuoteSendError);
      assert.equal(error.code, "quote_has_no_lines");
      return true;
    });
  });
});

describe("QuoteSendService — authorization and isolation", () => {
  it("cannot send another company's quote (not found, nothing dispatched)", async () => {
    const h = createHarness({ quote: makeQuote({ companyId: OTHER_COMPANY }) });
    await assert.rejects(service(h).send(sendInput()), (error: unknown) => {
      assert.ok(error instanceof QuoteSendError);
      assert.equal(error.status, 404);
      assert.equal(error.code, "quote_not_found");
      return true;
    });
    await assert.rejects(service(h).getSendOptions({ companyId: COMPANY, quoteId: QUOTE_ID }), /Quote not found/);
    assert.equal(h.dispatches.length, 0);
    assert.equal(h.attempts.length, 0);
  });

  it("an idempotency key from another company is not visible", async () => {
    const h = createHarness();
    h.attempts.push({
      id: "foreign",
      companyId: OTHER_COMPANY,
      idempotencyKey: "quote-send-key-0001",
      quoteId: QUOTE_ID,
      channel: "email",
      status: "sent",
      recipient: "x@other.test",
      conversationId: null,
      externalMessageId: null,
      errorCode: null,
      errorMessage: null,
      createdAt: NOW.toISOString(),
    });
    const result = await service(h).send(sendInput());
    assert.equal(result.replayed, false);
    assert.equal(result.recipient, "mona@example.test");
  });

  it("delegates only channel dispatch permissions, never quote or admin permissions", () => {
    assert.equal(QUOTE_SEND_PERMISSION, "quotes.send");
    const ctx = createQuoteSendDispatchContext({
      userId: "user-1",
      companyId: COMPANY,
      isSuperAdmin: false,
      hasPermission: () => false,
    });
    assert.equal(ctx.companyId, COMPANY);
    assert.equal(ctx.hasPermission("channel.platform.dispatch"), true);
    assert.equal(ctx.hasPermission("ai.conversations.reply"), true);
    assert.equal(ctx.hasPermission("quotes.send"), false);
    assert.equal(ctx.hasPermission("channels.manage"), false);
    assert.equal(QUOTE_SEND_DELEGATED_PERMISSIONS.size, 2);
  });

  it("route enforces auth, company scope and quotes.send before building the dispatch context", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "../../routes/quotes-send.ts"), "utf8");
    assert.match(src, /router\.use\(requireSupabaseAuth\)/);
    assert.match(src, /router\.use\(requireCompanyScope\("companyId"\)\)/);
    assert.match(src, /requireCompanyPermission\(userClient, companyId, QUOTE_SEND_PERMISSION\)/);
    assert.match(src, /status\(403|HttpError\(403/);
    assert.ok(
      src.indexOf("requireCompanyPermission(userClient") < src.indexOf("createQuoteSendDispatchContext(baseContext)"),
      "permission check must precede delegated context",
    );
    assert.match(src, /assertLocalExternalOutboundAllowed\("quotes\/send"\)/);
    assert.doesNotMatch(src, /mailto:|wa\.me|SMTP_PASS|client_secret|APP_SECRET/);
    const index = readFileSync(join(here, "../../routes/index.ts"), "utf8");
    assert.match(index, /router\.use\("\/quotes", quotesSendRouter\)/);
  });
});

describe("QuoteSendService — idempotency", () => {
  it("replays the same key without sending twice", async () => {
    const h = createHarness();
    const svc = service(h);
    const first = await svc.send(sendInput());
    const second = await svc.send(sendInput());
    assert.equal(second.replayed, true);
    assert.equal(second.attemptId, first.attemptId);
    assert.equal(h.dispatches.length, 1);
    assert.equal(h.markedSent.length, 1);
  });

  it("concurrent double-click sends exactly once", async () => {
    const h = createHarness({ dispatchDelayMs: 20 });
    const svc = service(h);
    const results = await Promise.allSettled([svc.send(sendInput()), svc.send(sendInput())]);
    assert.equal(h.dispatches.length, 1);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal((rejected[0]!.reason as QuoteSendError).code, "send_in_progress");
  });

  it("blocks a second key while another send for the quote is pending", async () => {
    const h = createHarness({ dispatchDelayMs: 20 });
    const svc = service(h);
    const results = await Promise.allSettled([
      svc.send(sendInput()),
      svc.send(sendInput({ idempotencyKey: "quote-send-key-0002" })),
    ]);
    assert.equal(h.dispatches.length, 1);
    assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  });

  it("rejects reusing a key for a different channel", async () => {
    const h = createHarness();
    const svc = service(h);
    await svc.send(sendInput());
    await assert.rejects(svc.send(sendInput({ channel: "whatsapp" })), /already used for a different send/);
  });

  it("allows retry with a new key after a failure", async () => {
    const h = createHarness({ dispatchError: providerError("temporary") });
    await assert.rejects(service(h).send(sendInput()), QuoteSendError);
    await assert.rejects(service(h).send(sendInput()), (error: unknown) => {
      assert.equal((error as QuoteSendError).code, "send_attempt_failed");
      return true;
    });

    const retry = createHarness();
    retry.attempts.push(...h.attempts.map((a) => ({ ...a, id: `prev-${a.id}` })));
    const result = await service(retry).send(sendInput({ idempotencyKey: "quote-send-key-0002" }));
    assert.equal(result.status, "sent");
    assert.equal(retry.attempts.at(-1)!.status, "sent");
  });

  it("closes abandoned pending attempts so the quote can be sent again", async () => {
    const h = createHarness();
    h.attempts.push({
      id: "stale",
      companyId: COMPANY,
      idempotencyKey: "quote-send-key-stale",
      quoteId: QUOTE_ID,
      channel: "email",
      status: "pending",
      recipient: "mona@example.test",
      conversationId: null,
      externalMessageId: null,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date(NOW.getTime() - QUOTE_SEND_STALE_PENDING_MS - 1000).toISOString(),
    });
    const result = await service(h).send(sendInput());
    assert.equal(result.status, "sent");
    assert.equal(h.attempts.find((a) => a.id === "stale")!.status, "failed");
  });

  it("rejects a missing or malformed idempotency key", async () => {
    const h = createHarness();
    await assert.rejects(service(h).send(sendInput({ idempotencyKey: "" })), /idempotencyKey/);
    await assert.rejects(service(h).send(sendInput({ idempotencyKey: "bad key with spaces" })), /idempotencyKey/);
    await assert.rejects(service(h).send(sendInput({ channel: "sms" })), /email or whatsapp/);
  });
});

describe("QuoteSendService — status and activity", () => {
  it("reports quoteStatusUpdated=false when delivery succeeded but the status update failed", async () => {
    const h = createHarness({ markSentError: new Error("RLS denied") });
    const result = await service(h).send(sendInput());
    assert.equal(result.status, "sent");
    assert.equal(result.quoteStatusUpdated, false);
    assert.equal(result.quoteStatus, null);
    assert.equal(h.attempts[0]!.status, "sent");
  });

  it("still returns sent when provider accepted but completeAttempt persistence fails", async () => {
    const h = createHarness({ completeAttemptError: new Error("db unavailable") });
    const result = await service(h).send(sendInput());
    assert.equal(result.status, "sent");
    assert.equal(h.dispatches.length, 1);
    // Attempt row may remain pending in DB — caller must not treat this as a failed send / auto-retry.
    assert.equal(h.attempts[0]!.status, "pending");
    assert.equal(result.quoteStatusUpdated, true);
  });

  it("records success activity with attempt, channel and delivery ids", async () => {
    const h = createHarness();
    await service(h).send(sendInput());
    const success = h.history.find((e) => e.eventType === "quote_send_succeeded");
    assert.ok(success);
    assert.equal(success.companyId, COMPANY);
    assert.equal(success.payload.attemptId, "att-1");
    assert.equal(success.payload.channel, "email");
    assert.equal(success.payload.deliveryEventId, "del-1");
    assert.equal(success.payload.externalMessageId, "ext-1");
    assert.equal(h.history.some((e) => e.eventType === "quote_send_failed"), false);
  });
});

describe("quote renderers", () => {
  const base = {
    language: "en" as const,
    company: { name: "Acme", logoUrl: "javascript:alert(1)", contactEmail: null, contactPhone: null },
    quote: {
      quoteNumber: "Q-1",
      title: "T",
      currency: "USD",
      issuedAt: "2026-09-20T10:00:00.000Z",
      validUntil: null,
      subtotal: 10,
      discountTotal: 0,
      taxTotal: 0,
      shippingTotal: 0,
      grandTotal: 10,
      notes: "<script>x</script>",
    },
    customerName: "<b>Mona</b>",
    lines: [{ name: "<img src=x>", quantity: 1, unitPrice: 10, discountAmount: 0, taxAmount: 0, total: 10, isOptional: false }],
  };

  it("escapes user content and drops non-http logos", () => {
    const html = renderQuoteEmailHtml(base);
    assert.doesNotMatch(html, /<script>|<img src=x>|<b>Mona<\/b>|javascript:/);
    assert.match(html, /&lt;script&gt;/);
  });

  it("omits validity when the quote has none and shows it when set", () => {
    assert.doesNotMatch(renderQuoteEmailHtml(base), /Valid until/i);
    const withValidity = renderQuoteEmailHtml({ ...base, quote: { ...base.quote, validUntil: "2026-10-15" } });
    assert.match(withValidity, /Valid until/i);
  });

  it("caps WhatsApp text length", () => {
    const lines = Array.from({ length: 60 }, (_, i) => ({ ...base.lines[0]!, name: `Item ${i}` }));
    const text = renderQuoteWhatsAppText({ ...base, lines });
    assert.ok(text.length <= 3900);
    assert.match(text, /\+40/);
  });
});
