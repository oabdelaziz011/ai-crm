import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ToolInputValidationError } from "../errors.js";
import { createQuoteAgentTools } from "./quote-agent-tools.js";
import type { QuoteAgentToolPorts, QuoteDraftToolResult } from "./quote-agent-ports.js";
import type { ToolExecutionContext } from "./tool-contract.js";

function ctx(overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext {
  return {
    companyId: "company-a",
    conversationId: "conv-1",
    conversationState: "waiting_user",
    userId: "user-1",
    ...overrides,
  };
}

function ports(result: QuoteDraftToolResult): QuoteAgentToolPorts {
  return {
    async createDraftQuoteFromVerifiedInterest() {
      return result;
    },
    async requestSendQuote() {
      throw new Error("not used");
    },
    async getQuoteDeliveryStatus() {
      throw new Error("not used");
    },
  };
}

describe("create_draft_quote tool", () => {
  it("returns draft-only success payload without send/approve/order flags", async () => {
    const tools = createQuoteAgentTools(
      ports({
        ok: true,
        created: true,
        alreadyExists: false,
        draftOnly: true,
        status: "draft",
        quoteId: "q1",
        quoteNumber: "Q-1",
        opportunityId: "opp-1",
        leadId: "lead-1",
        productId: "prod-1",
        productName: "Pack",
        quantity: 1,
        currency: "EGP",
        grandTotal: 100,
        unitPrice: 100,
        priceSource: "global",
        priceSourceNote: "global note",
        message: "Internal draft quote created successfully. It was NOT sent to the customer and is NOT approved.",
      }),
    );
    const tool = tools.create_draft_quote!;
    tool.validate({});
    const output = (await tool.execute(ctx(), {})) as Record<string, unknown>;
    assert.equal(output.success, true);
    assert.equal(output.draftOnly, true);
    assert.equal(output.status, "draft");
    assert.equal(output.sent, false);
    assert.equal(output.approved, false);
    assert.equal(output.orderCreated, false);
    assert.equal(output.paymentCreated, false);
    assert.match(String(output.instruction), /Never claim the quote was sent/i);
  });

  it("omits unitPrice and grandTotal when showProductPrices is false", async () => {
    const tools = createQuoteAgentTools({
      ...ports({
        ok: true,
        created: true,
        alreadyExists: false,
        draftOnly: true,
        status: "draft",
        quoteId: "q1",
        quoteNumber: "Q-1",
        opportunityId: "opp-1",
        leadId: "lead-1",
        productId: "prod-1",
        productName: "Pack",
        quantity: 1,
        currency: "EGP",
        grandTotal: 100,
        unitPrice: 100,
        priceSource: "global",
        priceSourceNote: "global note",
        message: "draft ok",
      }),
      showProductPrices: () => false,
    });
    const output = (await tools.create_draft_quote!.execute(ctx(), {})) as Record<string, unknown>;
    assert.equal(output.success, true);
    assert.equal("unitPrice" in output, false);
    assert.equal("grandTotal" in output, false);
    assert.equal(output.pricesVisible, false);
    assert.match(String(output.instruction), /Do not disclose/i);
  });

  it("surfaces needs_data without claiming a quote exists", async () => {
    const tools = createQuoteAgentTools(
      ports({
        ok: false,
        status: "needs_data",
        missing: ["opportunity"],
        askCustomer: "Need an opportunity.",
        message: "No open opportunity found for this lead.",
      }),
    );
    const output = (await tools.create_draft_quote!.execute(ctx(), {})) as Record<string, unknown>;
    assert.equal(output.success, false);
    assert.equal(output.status, "needs_data");
    assert.deepEqual(output.missing, ["opportunity"]);
    assert.equal("quoteId" in output, false);
  });

  it("surfaces permission denial", async () => {
    const tools = createQuoteAgentTools(
      ports({
        ok: false,
        status: "denied",
        errorCode: "PERMISSION_DENIED",
        message: "Missing quotes.create",
      }),
    );
    const output = (await tools.create_draft_quote!.execute(ctx(), {})) as Record<string, unknown>;
    assert.equal(output.success, false);
    assert.equal(output.errorCode, "PERMISSION_DENIED");
  });

  it("rejects invalid quantity before calling the port", async () => {
    let called = false;
    const tools = createQuoteAgentTools({
      async createDraftQuoteFromVerifiedInterest() {
        called = true;
        throw new Error("should not run");
      },
      async requestSendQuote() {
        throw new Error("not used");
      },
      async getQuoteDeliveryStatus() {
        throw new Error("not used");
      },
    });
    assert.throws(
      () => tools.create_draft_quote!.validate({ quantity: 0 }),
      ToolInputValidationError,
    );
    assert.equal(called, false);
  });

  it("requires trusted company/user/conversation context", async () => {
    const tools = createQuoteAgentTools(
      ports({
        ok: true,
        created: true,
        alreadyExists: false,
        draftOnly: true,
        status: "draft",
        quoteId: "q1",
        quoteNumber: "Q-1",
        opportunityId: "opp-1",
        leadId: "lead-1",
        productId: "prod-1",
        productName: null,
        quantity: 1,
        currency: "USD",
        grandTotal: 1,
        unitPrice: 1,
        priceSource: "global",
        priceSourceNote: "n",
        message: "ok",
      }),
    );
    await assert.rejects(
      () => tools.create_draft_quote!.execute(ctx({ userId: null }), {}),
      /authenticated user/i,
    );
  });
});
