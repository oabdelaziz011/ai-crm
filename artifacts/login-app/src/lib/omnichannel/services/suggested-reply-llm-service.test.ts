import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildContextualSuggestedReplies } from "./suggested-reply-llm-service.ts";
import type { ConversationMessageRecord } from "@workspace/ai-conversation";

function message(content: string): ConversationMessageRecord {
  return {
    id: "m1",
    company_id: "co",
    conversation_id: "c1",
    message_type: "incoming",
    content_type: "text",
    content,
    status: "delivered",
    created_at: "2026-09-06T10:00:00.000Z",
  } as ConversationMessageRecord;
}

describe("suggested-reply-llm-service fallback", () => {
  it("falls back to catalog when preferLlm is false", async () => {
    const result = await buildContextualSuggestedReplies({
      companyId: "co-a",
      conversationId: "c1",
      messages: [message("Can you check my booking time?")],
      summary: "Scheduling",
      customerTone: "neutral",
      targetLanguage: "en",
      intent: "Scheduling",
      preferLlm: false,
    });
    assert.equal(result.source, "catalog");
    assert.ok(result.replies.length >= 3);
    assert.ok(result.replies.every((reply) => !/^\s*[{[]/.test(reply.text)));
  });

  it("falls back to catalog when API is not configured", async () => {
    const previous = process.env.VITE_API_SERVER_URL;
    delete process.env.VITE_API_SERVER_URL;
    try {
      const result = await buildContextualSuggestedReplies({
        companyId: "co-a",
        conversationId: "c1",
        messages: [message("ممكن أعرف موعد الحجز؟")],
        summary: "جدولة",
        customerTone: "neutral",
        targetLanguage: "ar",
        intent: "جدولة",
        preferLlm: true,
      });
      assert.equal(result.source, "catalog");
      assert.equal(result.error, "api_not_configured");
      assert.ok(result.replies.every((reply) => /[\u0600-\u06FF]/.test(reply.text)));
    } finally {
      if (previous != null) process.env.VITE_API_SERVER_URL = previous;
    }
  });

  it("does not call browser secrets path and keeps short drafts", async () => {
    const result = await buildContextualSuggestedReplies({
      companyId: "co-a",
      conversationId: "c1",
      messages: [message("I paid yesterday but my booking isn't showing.")],
      summary: "Payment",
      customerTone: "frustrated",
      targetLanguage: "en",
      intent: "Billing",
      preferLlm: false,
    });
    assert.ok(result.replies.length >= 3 && result.replies.length <= 5);
    for (const reply of result.replies) {
      assert.ok(reply.text.split(/\s+/).length <= 40);
      assert.doesNotMatch(reply.text, /sk-[a-z0-9]{10,}/i);
    }
  });
});
