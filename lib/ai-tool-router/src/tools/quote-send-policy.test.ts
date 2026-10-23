import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createQuoteAgentTools } from "./quote-agent-tools.js";
import { resolveAiQuoteSendPolicy } from "./quote-send-policy.js";
import type { QuoteAgentToolPorts } from "./quote-agent-ports.js";
import type { ToolExecutionContext } from "./tool-contract.js";

const ctx: ToolExecutionContext = {
  companyId: "company-a",
  conversationId: "conv-1",
  conversationState: "waiting_user",
  userId: "user-1",
};

function basePorts(overrides: Partial<QuoteAgentToolPorts> = {}): QuoteAgentToolPorts {
  return {
    async createDraftQuoteFromVerifiedInterest() {
      throw new Error("not used");
    },
    async requestSendQuote() {
      return {
        ok: true,
        alreadyPending: false,
        quoteId: "quote-1",
        quoteNumber: "Q-1",
        quoteStatus: "draft",
        deliveryState: "pending_human_approval",
        channel: "email",
        sent: false,
        message: "Waiting for a teammate.",
      };
    },
    async getQuoteDeliveryStatus() {
      throw new Error("not used");
    },
    ...overrides,
  };
}

describe("AI quote send policy", () => {
  it("defaults to human approval when no persisted direct-send policy exists", () => {
    const policy = resolveAiQuoteSendPolicy({});
    assert.equal(policy.mode, "human_approval");
    assert.equal(policy.reason, "no_persisted_direct_send_policy");
  });

  it("refuses direct send without server quotes.send even if the stored mode says direct_send", () => {
    const policy = resolveAiQuoteSendPolicy({
      persistedMode: "direct_send",
      serverAuthorizedQuoteSend: false,
    });
    assert.equal(policy.mode, "human_approval");
    assert.equal(policy.reason, "direct_send_denied_missing_quotes_send");
  });

  it("allows direct send only when the persisted mode and server authorization both exist", () => {
    const policy = resolveAiQuoteSendPolicy({
      persistedMode: "direct_send",
      serverAuthorizedQuoteSend: true,
    });
    assert.equal(policy.mode, "direct_send");
  });

  it("queues human approval and never calls a sender when the host has no policy", async () => {
    let queued = 0;
    let sent = 0;
    const tools = createQuoteAgentTools(
      basePorts({
        async requestSendQuote() {
          queued += 1;
          return {
            ok: true,
            alreadyPending: false,
            quoteId: "quote-1",
            quoteNumber: "Q-1",
            quoteStatus: "draft",
            deliveryState: "pending_human_approval",
            channel: "whatsapp",
            sent: false,
            message: "Waiting for a teammate.",
          };
        },
        async sendAuthorizedQuote() {
          sent += 1;
          return { ok: true, sent: true, deliveryState: "sent", message: "sent" };
        },
      }),
    );
    const result = await tools.request_send_quote.execute(ctx, { channel: "whatsapp" });
    assert.equal(queued, 1);
    assert.equal(sent, 0);
    assert.equal(result.sent, false);
    assert.equal(result.requiresHumanApproval, true);
    assert.equal(result.policyReason, "no_persisted_direct_send_policy");
  });

  it("sends only through the authorized port when policy and permission are explicit", async () => {
    let queued = 0;
    const tools = createQuoteAgentTools(
      basePorts({
        async readPersistedQuoteSendPolicy() {
          return "direct_send";
        },
        serverAuthorizedQuoteSend: () => true,
        async requestSendQuote() {
          queued += 1;
          throw new Error("human queue should not run");
        },
        async sendAuthorizedQuote() {
          return {
            ok: true,
            sent: true,
            deliveryState: "sent",
            quoteId: "quote-1",
            quoteNumber: "Q-1",
            message: "Sent by authorized policy.",
          };
        },
      }),
    );
    const result = await tools.request_send_quote.execute(ctx, {});
    assert.equal(queued, 0);
    assert.equal(result.sent, true);
    assert.equal(result.deliveryState, "sent");
    assert.equal(result.policyReason, "explicit_policy_and_quotes_send");
  });

  it("drafts a quote and queues approval without sending when the customer asks for a quotation", async () => {
    let drafted = 0;
    let queued = 0;
    const tools = createQuoteAgentTools(
      basePorts({
        async createDraftQuoteFromVerifiedInterest() {
          drafted += 1;
          return {
            ok: true,
            quoteId: "quote-1",
            quoteNumber: "Q-SYN-1",
            quoteStatus: "draft",
            sent: false,
            orderCreated: false,
            paymentCreated: false,
            message: "Draft prepared.",
          };
        },
        async requestSendQuote() {
          queued += 1;
          return {
            ok: true,
            alreadyPending: false,
            quoteId: "quote-1",
            quoteNumber: "Q-SYN-1",
            quoteStatus: "draft",
            deliveryState: "pending_human_approval",
            channel: "email",
            sent: false,
            message: "Waiting for a teammate.",
          };
        },
      }),
    );
    const draft = await tools.create_draft_quote.execute(ctx, { quantity: 1 });
    const approval = await tools.request_send_quote.execute(ctx, { channel: "email" });
    assert.equal(drafted, 1);
    assert.equal(queued, 1);
    assert.equal(draft.sent, false);
    assert.equal(approval.sent, false);
    assert.equal(approval.requiresHumanApproval, true);
  });
});
