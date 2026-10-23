import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AI_SEND_REQUEST_METADATA_KEY } from "@workspace/ai-tool-router";
import {
  QuoteSendApprovalService,
  type QuoteSendApprovalPorts,
} from "./quote-send-approval-service.js";
import { QuoteSendError, QuoteSendService, type QuoteSendResult } from "./quote-send-service.js";

const COMPANY = "company-a";
const QUOTE = "11111111-1111-4111-8111-111111111111";

function pendingMeta(channel: "email" | "whatsapp" = "email") {
  return {
    [AI_SEND_REQUEST_METADATA_KEY]: {
      status: "pending_human_approval",
      channel,
      requestedAt: "2026-01-01T00:00:00.000Z",
      requestedByUserId: "ai-1",
      conversationId: "conv-1",
      resolvedAt: null,
      resolvedByUserId: null,
      attemptId: null,
      errorCode: null,
    },
  };
}

function memoryPorts(initial = pendingMeta()): QuoteSendApprovalPorts & {
  metadata: Record<string, unknown>;
  status: string;
  updatedAt: Date;
} {
  const state = {
    metadata: { ...initial },
    status: "draft",
    updatedAt: new Date(),
  };
  return {
    get metadata() {
      return state.metadata;
    },
    get status() {
      return state.status;
    },
    get updatedAt() {
      return state.updatedAt;
    },
    set updatedAt(value: Date) {
      state.updatedAt = value;
    },
    async listPendingSendRequests(companyId) {
      if (companyId !== COMPANY) return [];
      return [
        {
          quoteId: QUOTE,
          quoteNumber: "Q-9",
          status: state.status,
          title: "Test",
          contactName: "Ada",
          grandTotal: 10,
          currency: "EGP",
          metadata: state.metadata,
        },
      ];
    },
    async loadQuoteMetadata(companyId, quoteId) {
      if (companyId !== COMPANY || quoteId !== QUOTE) return null;
      return { metadata: state.metadata, status: state.status, quoteNumber: "Q-9" };
    },
    async writeQuoteMetadata(input) {
      state.metadata = input.metadata;
    },
    async claimPendingSendRequest(input) {
      const req = state.metadata?.aiSendRequest as { status?: string } | undefined;
      if (!req || req.status !== "pending_human_approval") return false;
      state.metadata = input.metadata;
      state.updatedAt = new Date();
      return true;
    },
    async reclaimStaleSendingRequest(input) {
      const req = state.metadata?.aiSendRequest as { status?: string } | undefined;
      if (!req || req.status !== "sending") return false;
      if (state.updatedAt >= input.staleBefore) return false;
      state.metadata = input.metadata;
      state.updatedAt = new Date();
      return true;
    },
  };
}

function fakeSendService(impl: {
  send: (input: unknown) => Promise<QuoteSendResult>;
}): QuoteSendService {
  return { send: impl.send.bind(impl) } as unknown as QuoteSendService;
}

describe("QuoteSendApprovalService", () => {
  it("lists only pending human-approval requests", async () => {
    const ports = memoryPorts();
    const service = new QuoteSendApprovalService(
      ports,
      fakeSendService({
        async send() {
          throw new Error("should not send");
        },
      }),
    );
    const items = await service.listPending(COMPANY);
    assert.equal(items.length, 1);
    assert.equal(items[0]!.channel, "email");
  });

  it("approveAndSend delegates to QuoteSendService and marks approved_sent", async () => {
    const ports = memoryPorts();
    let sendCalls = 0;
    const service = new QuoteSendApprovalService(
      ports,
      fakeSendService({
        async send() {
          sendCalls += 1;
          return {
            attemptId: "att-1",
            channel: "email",
            status: "sent",
            recipient: "a@b.com",
            conversationId: "c1",
            externalMessageId: "ext-1",
            quoteStatus: "sent",
            sentAt: "2026-01-02T00:00:00.000Z",
            quoteStatusUpdated: true,
            replayed: false,
          };
        },
      }),
    );
    const result = await service.approveAndSend({
      companyId: COMPANY,
      quoteId: QUOTE,
      actorUserId: "human-1",
    });
    assert.equal(sendCalls, 1);
    assert.equal(result.sent, true);
    assert.equal(result.deliveryState, "sent");
    assert.equal(
      (ports.metadata[AI_SEND_REQUEST_METADATA_KEY] as { status: string }).status,
      "approved_sent",
    );
  });

  it("on channel failure records approved_failed and does not claim sent", async () => {
    const ports = memoryPorts();
    const service = new QuoteSendApprovalService(
      ports,
      fakeSendService({
        async send() {
          throw new QuoteSendError(502, "provider_rejected", "SMTP rejected", {
            attemptId: "att-fail",
          });
        },
      }),
    );
    await assert.rejects(
      () =>
        service.approveAndSend({
          companyId: COMPANY,
          quoteId: QUOTE,
          actorUserId: "human-1",
        }),
      QuoteSendError,
    );
    const req = ports.metadata[AI_SEND_REQUEST_METADATA_KEY] as {
      status: string;
      errorCode: string;
      attemptId: string;
    };
    assert.equal(req.status, "approved_failed");
    assert.equal(req.errorCode, "provider_rejected");
    assert.equal(req.attemptId, "att-fail");
  });

  it("reject clears pending without calling send", async () => {
    const ports = memoryPorts();
    let sendCalls = 0;
    const service = new QuoteSendApprovalService(
      ports,
      fakeSendService({
        async send() {
          sendCalls += 1;
          throw new Error("no");
        },
      }),
    );
    const result = await service.reject({
      companyId: COMPANY,
      quoteId: QUOTE,
      actorUserId: "human-1",
    });
    assert.equal(result.sent, false);
    assert.equal(sendCalls, 0);
    assert.equal(
      (ports.metadata[AI_SEND_REQUEST_METADATA_KEY] as { status: string }).status,
      "rejected",
    );
  });

  it("refuses approve when quote already sent", async () => {
    const ports = memoryPorts();
    ports.loadQuoteMetadata = async () => ({
      metadata: pendingMeta(),
      status: "sent",
      quoteNumber: "Q-9",
    });
    const service = new QuoteSendApprovalService(
      ports,
      fakeSendService({
        async send() {
          throw new Error("should not");
        },
      }),
    );
    await assert.rejects(
      () =>
        service.approveAndSend({
          companyId: COMPANY,
          quoteId: QUOTE,
          actorUserId: "human-1",
        }),
      (error: unknown) => error instanceof QuoteSendError && error.code === "already_sent",
    );
  });

  it("reclaims stale sending without marking sent until provider succeeds", async () => {
    const ports = memoryPorts({
      [AI_SEND_REQUEST_METADATA_KEY]: {
        status: "sending",
        channel: "email",
        requestedAt: new Date().toISOString(),
        requestedByUserId: "ai-1",
        conversationId: null,
        resolvedAt: null,
        resolvedByUserId: "human-1",
        attemptId: null,
        errorCode: null,
      },
    });
    ports.updatedAt = new Date(Date.now() - 120_000);
    let sendCalls = 0;
    const service = new QuoteSendApprovalService(
      ports,
      fakeSendService({
        async send() {
          sendCalls += 1;
          return {
            attemptId: "att-reclaim",
            channel: "email",
            status: "sent",
            recipient: "a@b.com",
            conversationId: "c1",
            externalMessageId: "m1",
            quoteStatus: "sent",
            sentAt: new Date().toISOString(),
            quoteStatusUpdated: true,
            replayed: false,
          };
        },
      }),
    );
    const result = await service.approveAndSend({
      companyId: COMPANY,
      quoteId: QUOTE,
      actorUserId: "human-2",
      idempotencyKey: "idem-reclaim",
    });
    assert.equal(sendCalls, 1);
    assert.equal(result.sent, true);
    assert.equal(
      (ports.metadata[AI_SEND_REQUEST_METADATA_KEY] as { status: string }).status,
      "approved_sent",
    );
  });

  it("does not reclaim fresh sending (concurrent approve still blocked)", async () => {
    const ports = memoryPorts({
      [AI_SEND_REQUEST_METADATA_KEY]: {
        status: "sending",
        channel: "email",
        requestedAt: new Date().toISOString(),
        requestedByUserId: "ai-1",
        conversationId: null,
        resolvedAt: null,
        resolvedByUserId: "human-1",
        attemptId: null,
        errorCode: null,
      },
    });
    ports.updatedAt = new Date();
    const service = new QuoteSendApprovalService(
      ports,
      fakeSendService({
        async send() {
          throw new Error("should not send");
        },
      }),
    );
    await assert.rejects(
      () =>
        service.approveAndSend({
          companyId: COMPANY,
          quoteId: QUOTE,
          actorUserId: "human-2",
        }),
      (error: unknown) => error instanceof QuoteSendError && error.code === "send_in_progress",
    );
  });
});
