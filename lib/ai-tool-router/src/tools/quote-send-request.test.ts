import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getQuoteDeliveryStatus,
  requestSendQuote,
  type QuoteDeliveryCommandDeps,
} from "./quote-send-request.js";
import { AI_SEND_REQUEST_METADATA_KEY } from "./quote-delivery-status.js";

const COMPANY = "company-a";
const OTHER = "company-b";

function memoryDeps(seed?: {
  quote?: {
    quoteId: string;
    quoteNumber: string;
    status: string;
    companyId: string;
    opportunityId: string | null;
    metadata: Record<string, unknown>;
    lineCount: number;
  };
  attempt?: { status: "pending" | "sent" | "failed"; channel: string; errorCode: string | null };
}): QuoteDeliveryCommandDeps & { writes: unknown[] } {
  const writes: unknown[] = [];
  let quote = seed?.quote ?? {
    quoteId: "q1",
    quoteNumber: "Q-1",
    status: "draft",
    companyId: COMPANY,
    opportunityId: "opp-1",
    metadata: {},
    lineCount: 1,
  };
  return {
    writes,
    async loadQuoteForCompany({ companyId, quoteId }) {
      if (quote.quoteId !== quoteId) return null;
      if (quote.companyId !== companyId) return { ...quote };
      return quote;
    },
    async findLatestDraftQuoteForConversation() {
      return { quoteId: quote.quoteId };
    },
    async loadLatestSendAttempt() {
      return seed?.attempt
        ? {
            status: seed.attempt.status,
            channel: seed.attempt.channel,
            errorCode: seed.attempt.errorCode,
            createdAt: null,
          }
        : null;
    },
    async writeAiSendRequest(input) {
      writes.push(input);
      quote = {
        ...quote,
        metadata: input.metadata,
      };
    },
  };
}

describe("requestSendQuote", () => {
  it("queues pending_human_approval without marking sent", async () => {
    const deps = memoryDeps();
    const result = await requestSendQuote(deps, {
      companyId: COMPANY,
      userId: "u1",
      conversationId: "c1",
      channel: "email",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.deliveryState, "pending_human_approval");
    assert.equal(result.sent, false);
    assert.equal(result.alreadyPending, false);
    assert.equal(deps.writes.length, 1);
    const meta = (deps.writes[0] as { metadata: Record<string, unknown> }).metadata;
    assert.equal((meta[AI_SEND_REQUEST_METADATA_KEY] as { status: string }).status, "pending_human_approval");
  });

  it("reuses an existing pending request without duplicate write", async () => {
    const deps = memoryDeps({
      quote: {
        quoteId: "q1",
        quoteNumber: "Q-1",
        status: "draft",
        companyId: COMPANY,
        opportunityId: "opp-1",
        lineCount: 1,
        metadata: {
          [AI_SEND_REQUEST_METADATA_KEY]: {
            status: "pending_human_approval",
            channel: "whatsapp",
            requestedAt: "2026-01-01T00:00:00.000Z",
            requestedByUserId: "u0",
            conversationId: "c1",
            resolvedAt: null,
            resolvedByUserId: null,
            attemptId: null,
            errorCode: null,
          },
        },
      },
    });
    const result = await requestSendQuote(deps, {
      companyId: COMPANY,
      userId: "u1",
      conversationId: "c1",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.alreadyPending, true);
    assert.equal(result.channel, "whatsapp");
    assert.equal(result.sent, false);
    assert.equal(deps.writes.length, 0);
  });

  it("refuses when quote already sent", async () => {
    const deps = memoryDeps({
      quote: {
        quoteId: "q1",
        quoteNumber: "Q-1",
        status: "sent",
        companyId: COMPANY,
        opportunityId: "opp-1",
        metadata: {},
        lineCount: 1,
      },
    });
    const result = await requestSendQuote(deps, {
      companyId: COMPANY,
      userId: "u1",
      conversationId: "c1",
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, "already_sent");
    assert.equal(result.sent, true);
  });

  it("denies cross-company quote access", async () => {
    const deps = memoryDeps({
      quote: {
        quoteId: "q1",
        quoteNumber: "Q-1",
        status: "draft",
        companyId: OTHER,
        opportunityId: "opp-1",
        metadata: {},
        lineCount: 1,
      },
    });
    const result = await requestSendQuote(deps, {
      companyId: COMPANY,
      userId: "u1",
      conversationId: "c1",
      quoteId: "q1",
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.errorCode, "COMPANY_MISMATCH");
    assert.equal(result.sent, false);
  });
});

describe("getQuoteDeliveryStatus", () => {
  it("reports draft and never claims sent", async () => {
    const deps = memoryDeps();
    const status = await getQuoteDeliveryStatus(deps, {
      companyId: COMPANY,
      conversationId: "c1",
    });
    assert.equal(status.deliveryState, "draft");
    assert.equal(status.sent, false);
  });

  it("reports failed from send attempt without sent:true", async () => {
    const deps = memoryDeps({
      attempt: { status: "failed", channel: "email", errorCode: "provider_rejected" },
    });
    const status = await getQuoteDeliveryStatus(deps, {
      companyId: COMPANY,
      conversationId: "c1",
      quoteId: "q1",
    });
    assert.equal(status.deliveryState, "failed");
    assert.equal(status.sent, false);
    assert.equal(status.errorCode, "provider_rejected");
  });
});
