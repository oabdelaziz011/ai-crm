import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ensureKnowledgeSectionOrder } from "../utils/compose-prompt.js";

describe("ensureKnowledgeSectionOrder", () => {
  it("inserts knowledge_context after customer_360 and before tools", () => {
    const order = ensureKnowledgeSectionOrder(
      ["system_instructions", "customer_360", "recent_messages", "intent_decision", "tool_results"],
      true,
    );
    assert.deepEqual(order, [
      "system_instructions",
      "customer_360",
      "knowledge_context",
      "recent_messages",
      "intent_decision",
      "tool_results",
    ]);
  });

  it("leaves order unchanged when knowledge is absent", () => {
    const base = ["system_instructions", "recent_messages", "intent_decision"];
    assert.deepEqual(ensureKnowledgeSectionOrder(base, false), base);
  });
});
