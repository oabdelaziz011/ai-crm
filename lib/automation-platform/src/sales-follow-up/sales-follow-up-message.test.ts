import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  composeSalesFollowUpFallbackMessage,
  composeSalesFollowUpMessage,
  isDuplicateSalesFollowUpMessage,
  isSalesFollowUpMessageTooSimilar,
} from "./sales-follow-up-message.js";

const baseContext = {
  companyId: "c1",
  customerDisplayName: "Sara",
  productOrInterest: "ValueOR CRM",
  lastCustomerMessage: "كم السعر؟",
  salesStage: "qualified",
  channel: "whatsapp",
  language: "ar",
  attemptNumber: 1,
  maxAttempts: 3,
  previousFollowUpMessages: [] as string[],
};

describe("sales follow-up message anti-duplicate", () => {
  it("treats punctuation-only differences as duplicates", () => {
    assert.equal(
      isSalesFollowUpMessageTooSimilar(
        "مرحباً Sara، هل ما زلت مهتماً؟",
        "مرحبا Sara هل ما زلت مهتما",
      ),
      true,
    );
  });

  it("fallback messages differ across attempts", () => {
    const first = composeSalesFollowUpFallbackMessage(baseContext);
    const second = composeSalesFollowUpFallbackMessage({
      ...baseContext,
      attemptNumber: 2,
      previousFollowUpMessages: [first],
    });
    assert.equal(isDuplicateSalesFollowUpMessage(second, [first]), false);
  });

  it("rejects AI duplicates and falls back", async () => {
    const previous = ["Hi Sara, still interested in ValueOR CRM?"];
    const result = await composeSalesFollowUpMessage({
      context: {
        ...baseContext,
        language: "en",
        lastCustomerMessage: "price?",
        previousFollowUpMessages: previous,
      },
      ai: {
        async complete() {
          return { text: previous[0]! };
        },
      },
      maxAiRetries: 1,
    });
    assert.equal(result.source, "fallback");
    assert.ok(result.rejectedDuplicates >= 1);
    assert.equal(isDuplicateSalesFollowUpMessage(result.text, previous), false);
  });
});
