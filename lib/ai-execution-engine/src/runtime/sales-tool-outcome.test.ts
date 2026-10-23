import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  guardUnverifiedQuoteClaims,
  hasVerifiedBusinessOutcome,
  isRecoverableProviderFailure,
  summarizeSalesToolOutcome,
  toolCallSignature,
} from "./sales-tool-outcome.js";

describe("sales tool outcome", () => {
  it("rejects a customer id shaped failure without claiming a quote", () => {
    const text = summarizeSalesToolOutcome([
      {
        toolKey: "qualify_lead",
        status: "failed",
        output: { success: false, errorCode: "NOT_A_LEAD" },
      },
      {
        toolKey: "create_draft_quote",
        status: "succeeded",
        output: { success: false, draftOnly: true, sent: false, missing: ["lead"] },
      },
    ]);
    assert.match(text, /not created/i);
    assert.match(text, /not sent/i);
    assert.equal(
      guardUnverifiedQuoteClaims("The quote was created and sent.", [
        { toolKey: "create_draft_quote", status: "succeeded", output: { success: false } },
      ]),
      "The quote draft was not created, and it was not sent.",
    );
  });

  it("keeps a verified draft quote and detects a repeated call", () => {
    const text = summarizeSalesToolOutcome([
      {
        toolKey: "create_draft_quote",
        status: "succeeded",
        output: { success: true, quoteId: "quote-1", draftOnly: true, sent: false },
      },
    ]);
    assert.match(text, /draft quote was saved/i);
    assert.match(text, /not sent/i);
    assert.equal(
      guardUnverifiedQuoteClaims("The quote was created.", [
        { toolKey: "create_draft_quote", status: "succeeded", output: { success: true, quoteId: "quote-1" } },
      ]),
      "The quote was created.",
    );
    assert.equal(
      toolCallSignature("qualify_lead", { leadId: "a", score: 1 }),
      toolCallSignature("qualify_lead", { score: 1, leadId: "a" }),
    );
  });

  it("localizes a verified draft and does not claim an unverified send", () => {
    const text = summarizeSalesToolOutcome(
      [
        {
          toolKey: "create_customer",
          status: "succeeded",
          output: { success: true, customerId: "customer-1", leadId: "lead-1" },
        },
        {
          toolKey: "create_draft_quote",
          status: "succeeded",
          output: { success: true, quoteId: "quote-1", draftOnly: true, sent: false },
        },
      ],
      "ar",
    );
    assert.match(text, /مسودة/);
    assert.match(text, /لم يتم إرسالها/);
    assert.equal(text.includes("quote-1"), false);
    assert.equal(
      guardUnverifiedQuoteClaims("تم إرسال عرض السعر", [
        { toolKey: "create_draft_quote", status: "failed", output: { success: false, sent: false } },
      ]),
      "لم يتم إنشاء مسودة عرض السعر، ولم يتم إرسالها.",
    );
    assert.equal(
      hasVerifiedBusinessOutcome([
        { toolKey: "search_products", status: "succeeded", output: { success: true } },
      ]),
      false,
    );
  });

  it("treats a provider rate limit as recoverable and a validation error as not", () => {
    assert.equal(isRecoverableProviderFailure(new Error("provider_rate_limit_exceeded")), true);
    assert.equal(isRecoverableProviderFailure({ code: "PROVIDER_UNAVAILABLE", message: "Provider unavailable." }), true);
    assert.equal(isRecoverableProviderFailure({ status: 429, message: "Too many requests" }), true);
    assert.equal(isRecoverableProviderFailure(new Error("Permission denied: leads.qualify")), false);
    assert.equal(isRecoverableProviderFailure(new Error("Lead not found: customer-1")), false);
    assert.equal(isRecoverableProviderFailure(new Error("schema validation failed")), false);
  });
});
