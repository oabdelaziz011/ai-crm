import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { QUOTE_SEND_PERMISSION } from "../services/quote-send/quote-send-dispatch-context.js";
import { QuoteSendApprovalService } from "../services/quote-send/quote-send-approval-service.js";
import { QuoteSendError, QuoteSendService } from "../services/quote-send/quote-send-service.js";
import { AI_SEND_REQUEST_METADATA_KEY } from "@workspace/ai-tool-router";

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(resolve(here, "quotes-send.ts"), "utf8");

describe("quotes send-requests routes", () => {
  it("registers list/approve/reject under quotes.send and QuoteSendService", () => {
    assert.match(routeSource, /\/send-requests/);
    assert.match(routeSource, /\/send-requests\/approve/);
    assert.match(routeSource, /\/send-requests\/reject/);
    assert.match(routeSource, /QuoteSendApprovalService/);
    assert.match(routeSource, /authorizeQuotesSendActor/);
    assert.match(routeSource, /buildQuoteSendService/);
    assert.match(routeSource, /assertLocalExternalOutboundAllowed\("quotes\/send-requests\/approve"\)/);
    assert.equal(QUOTE_SEND_PERMISSION, "quotes.send");
  });

  it("does not invent a parallel dispatcher for approve", () => {
    assert.doesNotMatch(routeSource, /dispatchOmnichannelOutboundMessage/);
    assert.match(routeSource, /approveAndSend/);
  });

  it("wires local Fake Provider only through QuoteSendService ports (gated)", () => {
    assert.match(routeSource, /isLocalFakeQuoteSendProviderEnabled/);
    assert.match(routeSource, /withLocalFakeQuoteSendPorts/);
    assert.match(routeSource, /new QuoteSendService\(ports\)/);
  });

  it("list/reject skip full QuoteSendService construction; fake control requires quotes.send", () => {
    assert.match(routeSource, /listRejectSendStub/);
    assert.match(routeSource, /authorizeQuotesSendActor\(req\)/);
    assert.match(routeSource, /send-fake-control[\s\S]*authorizeQuotesSendActor/);
  });

  it("keeps local fake stats/control outside providerOpsRateLimiter", () => {
    const statsIdx = routeSource.indexOf('router.get("/send-fake-stats"');
    const controlIdx = routeSource.indexOf('router.post("/send-fake-control"');
    const limiterIdx = routeSource.indexOf("router.use(providerOpsRateLimiter)");
    assert.ok(statsIdx >= 0 && controlIdx >= 0 && limiterIdx >= 0);
    assert.ok(statsIdx < limiterIdx, "send-fake-stats must register before providerOpsRateLimiter");
    assert.ok(controlIdx < limiterIdx, "send-fake-control must register before providerOpsRateLimiter");
  });
});

describe("QuoteSendApprovalService tenant + duplicate guards", () => {
  it("lists only the requested company pending rows", async () => {
    const ports = {
      async listPendingSendRequests(companyId: string) {
        if (companyId !== "company-a") return [];
        return [
          {
            quoteId: "q1",
            quoteNumber: "Q-1",
            status: "draft",
            title: "T",
            contactName: "Ada",
            grandTotal: 1,
            currency: "EGP",
            metadata: {
              [AI_SEND_REQUEST_METADATA_KEY]: {
                status: "pending_human_approval",
                channel: "email",
                requestedAt: "2026-01-01T00:00:00.000Z",
                requestedByUserId: "u1",
                conversationId: null,
                resolvedAt: null,
                resolvedByUserId: null,
                attemptId: null,
                errorCode: null,
              },
            },
          },
        ];
      },
      async loadQuoteMetadata() {
        return null;
      },
      async writeQuoteMetadata() {},
      async claimPendingSendRequest() {
        return false;
      },
      async reclaimStaleSendingRequest() {
        return false;
      },
    };
    const service = new QuoteSendApprovalService(ports, {
      send: async () => {
        throw new Error("no");
      },
    } as unknown as QuoteSendService);
    assert.equal((await service.listPending("company-a")).length, 1);
    assert.equal((await service.listPending("company-b")).length, 0);
    const item = (await service.listPending("company-a"))[0]!;
    assert.equal(item.sent, false);
    assert.equal(item.deliveryState, "pending_human_approval");
  });

  it("rejects approve when there is no pending request (duplicate / already handled)", async () => {
    const service = new QuoteSendApprovalService(
      {
        async listPendingSendRequests() {
          return [];
        },
        async loadQuoteMetadata() {
          return { metadata: {}, status: "draft", quoteNumber: "Q-1" };
        },
        async writeQuoteMetadata() {},
        async claimPendingSendRequest() {
          return false;
        },
        async reclaimStaleSendingRequest() {
          return false;
        },
      },
      {
        send: async () => {
          throw new Error("should not send");
        },
      } as unknown as QuoteSendService,
    );
    await assert.rejects(
      () =>
        service.approveAndSend({
          companyId: "company-a",
          quoteId: "q1",
          actorUserId: "human",
        }),
      (error: unknown) => error instanceof QuoteSendError && error.code === "no_pending_send_request",
    );
  });
});
