/**
 * QuoteSendService + Fake Provider (in-process) — success, fail, no double send.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFakeQuoteSendDispatchController } from "./fake-quote-send-dispatch.js";
import { QuoteSendError, QuoteSendService, type QuoteSendPorts, type QuoteSnapshot } from "./quote-send-service.js";
import { QuoteSendApprovalService } from "./quote-send-approval-service.js";
import { AI_SEND_REQUEST_METADATA_KEY } from "@workspace/ai-tool-router";

const NOW = new Date("2026-10-20T00:00:00.000Z");

function makeQuote(): QuoteSnapshot {
  return {
    id: "quote-1",
    companyId: "company-a",
    quoteNumber: "Q-100",
    title: "Pack",
    status: "draft",
    currency: "EGP",
    language: "en",
    contactName: "Mona",
    validUntil: null,
    subtotal: 100,
    discountTotal: 0,
    taxTotal: 0,
    shippingTotal: 0,
    grandTotal: 100,
    notes: "",
    customerId: null,
    opportunityId: null,
    createdAt: NOW.toISOString(),
    lines: [
      {
        name: "Line",
        quantity: 1,
        unitPrice: 100,
        discountAmount: 0,
        taxAmount: 0,
        total: 100,
        isOptional: false,
      },
    ],
  };
}

function buildPorts(fake: ReturnType<typeof createFakeQuoteSendDispatchController>): {
  ports: QuoteSendPorts;
  attempts: Array<{ id: string; status: string; idempotencyKey: string; quoteId: string }>;
} {
  const quote = makeQuote();
  const attempts: Array<{
    id: string;
    status: string;
    idempotencyKey: string;
    quoteId: string;
    companyId: string;
    channel: string;
    createdAt: string;
  }> = [];
  let seq = 0;
  const ports: QuoteSendPorts = {
    async loadQuote(companyId, quoteId) {
      if (quote.companyId !== companyId || quote.id !== quoteId) return null;
      return { ...quote };
    },
    async loadCompanyIdentity() {
      return { name: "Acme", logoUrl: null, contactEmail: "a@test.local", contactPhone: null };
    },
    async resolveRecipient() {
      return {
        customerId: null,
        leadId: null,
        name: "Mona",
        email: "mona@valueor-test.local",
        phone: "+201000000000",
      };
    },
    async isChannelEntitled() {
      return true;
    },
    async findEmailChannel() {
      return { companyChannelId: "cc-email", fromEmail: "sales@valueor-test.local" };
    },
    async resolveWhatsAppRoute() {
      return {
        ok: true,
        companyChannelId: "cc-wa",
        conversationId: "conv-wa",
        channelSessionId: "sess-wa",
        externalThreadId: "201000000000",
      };
    },
    async findAttemptByKey(companyId, key) {
      const a = attempts.find((x) => x.companyId === companyId && x.idempotencyKey === key);
      if (!a) return null;
      return {
        id: a.id,
        quoteId: a.quoteId,
        channel: a.channel as "email",
        status: a.status as "pending" | "sent" | "failed",
        recipient: "mona@valueor-test.local",
        conversationId: null,
        externalMessageId: a.status === "sent" ? "ext" : null,
        errorCode: null,
        errorMessage: null,
        createdAt: a.createdAt,
      };
    },
    async closeStalePendingAttempts() {},
    async createPendingAttempt(input) {
      if (attempts.some((a) => a.companyId === input.companyId && a.idempotencyKey === input.idempotencyKey)) {
        return { conflict: "duplicate_key" };
      }
      if (attempts.some((a) => a.quoteId === input.quoteId && a.status === "pending")) {
        return { conflict: "pending_exists" };
      }
      const attempt = {
        id: `att-${++seq}`,
        companyId: input.companyId,
        idempotencyKey: input.idempotencyKey,
        quoteId: input.quoteId,
        channel: input.channel,
        status: "pending",
        createdAt: NOW.toISOString(),
      };
      attempts.push(attempt);
      return {
        attempt: {
          id: attempt.id,
          quoteId: attempt.quoteId,
          channel: input.channel,
          status: "pending",
          recipient: input.recipient,
          conversationId: null,
          externalMessageId: null,
          errorCode: null,
          errorMessage: null,
          createdAt: attempt.createdAt,
        },
      };
    },
    async completeAttempt(id, patch) {
      const a = attempts.find((x) => x.id === id)!;
      a.status = patch.status;
    },
    async createEmailConversation() {
      return { conversationId: "conv-e", channelSessionId: "sess-e", externalThreadId: "conv-e" };
    },
    dispatch: (input) => fake.dispatch(input),
    async markQuoteSent(_c, quoteId) {
      quote.status = "sent";
      return { status: "sent", sentAt: NOW.toISOString() };
    },
    async addQuoteHistory() {},
  };
  return { ports, attempts };
}

describe("QuoteSendService with Fake Provider", () => {
  it("marks quote sent only after fake provider success and records one attempt", async () => {
    const fake = createFakeQuoteSendDispatchController({ mode: "success" });
    const { ports, attempts } = buildPorts(fake);
    const service = new QuoteSendService(ports, () => NOW);
    const result = await service.send({
      companyId: "company-a",
      quoteId: "quote-1",
      channel: "email",
      idempotencyKey: "idem-success-1",
      actorUserId: "user-1",
    });
    assert.equal(result.status, "sent");
    assert.equal(result.quoteStatus, "sent");
    assert.equal(fake.calls.length, 1);
    assert.equal(attempts.filter((a) => a.status === "sent").length, 1);
  });

  it("on fake provider failure keeps quote draft and attempt failed", async () => {
    const fake = createFakeQuoteSendDispatchController({ mode: "fail" });
    const { ports, attempts } = buildPorts(fake);
    const service = new QuoteSendService(ports, () => NOW);
    await assert.rejects(
      () =>
        service.send({
          companyId: "company-a",
          quoteId: "quote-1",
          channel: "email",
          idempotencyKey: "idem-fail-1",
          actorUserId: "user-1",
        }),
      (err: unknown) => err instanceof QuoteSendError,
    );
    assert.equal(fake.calls.length, 1);
    assert.equal(attempts[0]?.status, "failed");
    const quote = await ports.loadQuote("company-a", "quote-1");
    assert.equal(quote?.status, "draft");
  });

  it("duplicate idempotency key does not dispatch twice", async () => {
    const fake = createFakeQuoteSendDispatchController({ mode: "success" });
    const { ports } = buildPorts(fake);
    const service = new QuoteSendService(ports, () => NOW);
    const first = await service.send({
      companyId: "company-a",
      quoteId: "quote-1",
      channel: "email",
      idempotencyKey: "idem-dup-1",
      actorUserId: "user-1",
    });
    const second = await service.send({
      companyId: "company-a",
      quoteId: "quote-1",
      channel: "email",
      idempotencyKey: "idem-dup-1",
      actorUserId: "user-1",
    });
    assert.equal(first.replayed, false);
    assert.equal(second.replayed, true);
    assert.equal(fake.calls.length, 1);
  });

  it("provider timeout marks attempt failed and does not leave quote sent", async () => {
    const fake = createFakeQuoteSendDispatchController({ mode: "timeout", delayMs: 5 });
    const { ports, attempts } = buildPorts(fake);
    const service = new QuoteSendService(ports, () => NOW);
    await assert.rejects(
      () =>
        service.send({
          companyId: "company-a",
          quoteId: "quote-1",
          channel: "email",
          idempotencyKey: "idem-timeout-1",
          actorUserId: "user-1",
        }),
      (err: unknown) => err instanceof QuoteSendError,
    );
    assert.equal(fake.calls.length, 1);
    assert.equal(attempts[0]?.status, "failed");
    const quote = await ports.loadQuote("company-a", "quote-1");
    assert.equal(quote?.status, "draft");
  });
});

describe("QuoteSendApprovalService + Fake QuoteSendService path", () => {
  it("approve uses QuoteSendService.send once; reject never dispatches", async () => {
    const fake = createFakeQuoteSendDispatchController({ mode: "success" });
    const { ports: sendPorts } = buildPorts(fake);
    const sendService = new QuoteSendService(sendPorts, () => NOW);

    let metadata: Record<string, unknown> = {
      [AI_SEND_REQUEST_METADATA_KEY]: {
        status: "pending_human_approval",
        channel: "email",
        requestedAt: NOW.toISOString(),
        requestedByUserId: "u1",
        conversationId: null,
        resolvedAt: null,
        resolvedByUserId: null,
        attemptId: null,
        errorCode: null,
      },
    };

    const approvalPorts = {
      async listPendingSendRequests() {
        return [];
      },
      async loadQuoteMetadata(companyId: string, quoteId: string) {
        if (companyId !== "company-a" || quoteId !== "quote-1") return null;
        return { id: quoteId, companyId, status: "draft", metadata };
      },
      async writeQuoteMetadata(input: {
        companyId: string;
        quoteId: string;
        metadata: Record<string, unknown>;
      }) {
        metadata = input.metadata;
      },
      async claimPendingSendRequest(input: {
        companyId: string;
        quoteId: string;
        metadata: Record<string, unknown>;
      }) {
        const req = metadata[AI_SEND_REQUEST_METADATA_KEY] as { status?: string } | undefined;
        if (!req || req.status !== "pending_human_approval") return false;
        metadata = input.metadata;
        return true;
      },
      async reclaimStaleSendingRequest() {
        return false;
      },
    };

    const approval = new QuoteSendApprovalService(approvalPorts as never, sendService);

    await approval.reject({ companyId: "company-a", quoteId: "quote-1", actorUserId: "u1" });
    assert.equal(fake.calls.length, 0);
    assert.equal(
      (metadata[AI_SEND_REQUEST_METADATA_KEY] as { status: string }).status,
      "rejected",
    );

    metadata = {
      [AI_SEND_REQUEST_METADATA_KEY]: {
        status: "pending_human_approval",
        channel: "email",
        requestedAt: NOW.toISOString(),
        requestedByUserId: "u1",
        conversationId: null,
        resolvedAt: null,
        resolvedByUserId: null,
        attemptId: null,
        errorCode: null,
      },
    };

    const approved = await approval.approveAndSend({
      companyId: "company-a",
      quoteId: "quote-1",
      actorUserId: "u1",
      idempotencyKey: "idem-approve-1",
    });
    assert.equal(approved.sent, true);
    assert.equal(approved.deliveryState, "sent");
    assert.equal(fake.calls.length, 1);
  });
});
