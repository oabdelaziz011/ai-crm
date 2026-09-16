import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  beginQuickRepliesRefresh,
  completeQuickRepliesRefresh,
  createQuickRepliesSession,
  fingerprintSuggestionContext,
  isSuggestionSetDifferent,
  reconcileQuickRepliesSession,
} from "./quick-replies-session.ts";
import type { IntelligentSuggestedReply } from "@/lib/omnichannel/types/suggested-reply-types";
import { buildIntelligentSuggestedReplies } from "./suggested-reply-intelligence-service.ts";
import { collectContextualSuggestedReplySamples } from "./suggested-reply-catalog.ts";
import type { ConversationMessageRecord } from "@workspace/ai-conversation";

function reply(id: string, text: string): IntelligentSuggestedReply {
  return {
    id,
    text,
    confidence: 80,
    intent: "general",
    explanation: {
      reason: "test",
      signalsUsed: ["last_messages"],
      intent: "General",
      mood: "neutral",
      journey: "Active",
      knowledgeSource: null,
      confidence: 80,
    },
  };
}

function message(content: string, type: "incoming" | "outgoing" = "incoming"): ConversationMessageRecord {
  return {
    id: `m-${content.slice(0, 8)}`,
    company_id: "co",
    conversation_id: "c1",
    message_type: type,
    content_type: "text",
    content,
    status: "delivered",
    created_at: "2026-09-06T10:00:00.000Z",
  } as ConversationMessageRecord;
}

describe("quick replies session", () => {
  it("resets suggestions when conversation changes (no leak)", () => {
    const prev = createQuickRepliesSession("c1", [reply("a", "Hello")], "fp-a");
    const next = reconcileQuickRepliesSession({
      prev,
      conversationId: "c2",
      incomingSuggestions: [reply("b", "مرحبا")],
      contextFingerprint: "fp-b",
    });
    assert.equal(next.conversationId, "c2");
    assert.equal(next.suggestions[0]?.text, "مرحبا");
    assert.equal(next.variantOffset, 0);
  });

  it("keeps refreshed set for same conversation + context", () => {
    const prev = {
      ...createQuickRepliesSession("c1", [reply("a", "A")], "fp"),
      variantOffset: 2,
      suggestions: [reply("r", "Refreshed")],
    };
    const next = reconcileQuickRepliesSession({
      prev,
      conversationId: "c1",
      incomingSuggestions: [reply("a", "A")],
      contextFingerprint: "fp",
    });
    assert.equal(next.suggestions[0]?.text, "Refreshed");
    assert.equal(next.variantOffset, 2);
  });

  it("prevents concurrent refresh starts", () => {
    const loading = beginQuickRepliesRefresh({
      ...createQuickRepliesSession("c1", [reply("a", "A")]),
      loading: true,
    });
    assert.equal(loading, null);
  });

  it("ignores stale refresh completion after conversation switch", () => {
    const prev = createQuickRepliesSession("c2", [reply("b", "B")]);
    const next = completeQuickRepliesRefresh({
      prev,
      conversationId: "c1",
      suggestions: [reply("stale", "Stale")],
      variantOffset: 3,
    });
    assert.equal(next.suggestions[0]?.text, "B");
  });

  it("fingerprint changes with customer message language context", () => {
    const en = fingerprintSuggestionContext({
      conversationId: "c1",
      lastCustomerMessage: "Can you check my booking?",
      targetLanguage: "en",
    });
    const ar = fingerprintSuggestionContext({
      conversationId: "c1",
      lastCustomerMessage: "ممكن أعرف موعد الحجز؟",
      targetLanguage: "ar",
    });
    assert.notEqual(en, ar);
  });
});

describe("contextual AI suggestions", () => {
  it("Arabic conversation yields Arabic short suggestions", () => {
    const replies = buildIntelligentSuggestedReplies({
      messages: [message("ممكن أعرف موعد الحجز؟")],
      summary: "جدولة",
      customerTone: "neutral",
      targetLanguage: "ar",
      limit: 4,
    });
    assert.ok(replies.length >= 3);
    assert.ok(replies.every((item) => /[\u0600-\u06FF]/.test(item.text)));
    assert.ok(replies.every((item) => item.text.length < 160));
  });

  it("English conversation yields English short suggestions", () => {
    const replies = buildIntelligentSuggestedReplies({
      messages: [message("Can you check my booking time?")],
      summary: "Scheduling",
      customerTone: "neutral",
      targetLanguage: "en",
      limit: 4,
    });
    assert.ok(replies.length >= 3);
    assert.ok(replies.every((item) => /[a-z]/i.test(item.text)));
    assert.ok(replies.every((item) => !/[\u0600-\u06FF]/.test(item.text)));
  });

  it("refresh variantOffset produces a different suggestion set when catalog allows", () => {
    const first = buildIntelligentSuggestedReplies({
      messages: [message("I need a refund")],
      summary: "Refund",
      customerTone: "angry",
      targetLanguage: "en",
      variantOffset: 0,
      limit: 4,
    });
    const second = buildIntelligentSuggestedReplies({
      messages: [message("I need a refund")],
      summary: "Refund",
      customerTone: "angry",
      targetLanguage: "en",
      variantOffset: 2,
      limit: 4,
    });
    assert.ok(isSuggestionSetDifferent(first, second));
  });

  it("collectContextualSuggestedReplySamples rotates without duplicates in a page", () => {
    const samples = collectContextualSuggestedReplySamples({
      language: "en",
      primaryBucket: "scheduling",
      relatedBuckets: ["general"],
      limit: 4,
      variantOffset: 1,
    });
    assert.equal(new Set(samples).size, samples.length);
    assert.ok(samples.length >= 3 && samples.length <= 5);
  });
});
