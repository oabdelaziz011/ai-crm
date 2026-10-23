import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createQuoteAgentTools } from "@workspace/ai-tool-router";
import { createWebhookQuoteAgentPorts } from "./webhook-quote-agent-ports.js";

describe("webhook quote agent wiring", () => {
  it("registers draft + delivery tools from webhook quote ports", () => {
    const fakeClient = {
      from() {
        throw new Error("not used in handler registration");
      },
    };
    const ports = createWebhookQuoteAgentPorts(fakeClient as never);
    const tools = createQuoteAgentTools(ports);
    assert.ok(tools.create_draft_quote);
    assert.ok(tools.request_send_quote);
    assert.ok(tools.get_quote_delivery_status);
  });

  it("exposes request/status ports but never a direct send method", () => {
    const fakeClient = {
      from() {
        throw new Error("not used");
      },
    };
    const ports = createWebhookQuoteAgentPorts(fakeClient as never);
    const keys = Object.keys(ports).sort();
    assert.deepEqual(keys, [
      "createDraftQuoteFromVerifiedInterest",
      "getQuoteDeliveryStatus",
      "requestSendQuote",
      "showProductPrices",
    ]);
    assert.equal(Object.prototype.hasOwnProperty.call(ports, "sendQuote"), false);
  });
});
