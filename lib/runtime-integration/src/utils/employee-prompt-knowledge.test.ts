import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KnowledgeContextBuilder } from "@workspace/ai-prompt-orchestrator";
import { ensureKnowledgeSectionOrder } from "@workspace/ai-prompt-orchestrator";
import { assembleEmployeePromptKnowledge } from "./runtime-utils.js";

const companyAFact = "Aurora Buds battery is 6 hours.";

function retrieval(content: string) {
  return {
    executionId: "retr-1",
    chunkCount: 1,
    totalTokens: 12,
    chunks: [{ content, metadata: { documentTitle: "Catalog", companyId: "company-a" } }],
  };
}

describe("webhook employee prompt knowledge", () => {
  it("passes retrieved facts into the webhook knowledge context once", () => {
    const assembled = assembleEmployeePromptKnowledge({
      mode: "webhook",
      companyInstructions: "Greet as Northwind.",
      retrieval: retrieval(companyAFact),
    });
    assert.match(assembled.systemInstructions[0] ?? "", /2026-10-21.4/);
    assert.match(assembled.systemInstructions.join("\n"), /CURRENT DATE \(Africa\/Cairo\): \d{4}-\d{2}-\d{2}/);
    assert.equal(assembled.systemInstructions.some((part) => part.includes(companyAFact)), false);
    assert.match(assembled.knowledge?.contextText ?? "", /Aurora Buds battery is 6 hours/);

    const section = new KnowledgeContextBuilder().build({
      knowledge: assembled.knowledge,
    } as never).knowledge_context;
    const order = ensureKnowledgeSectionOrder(["system_instructions"], true);
    assert.equal(order.includes("knowledge_context"), true);
    assert.match(section?.content ?? "", /Aurora Buds battery is 6 hours/);
    assert.doesNotMatch(section?.content ?? "", /company-b secret/);
  });

  it("leaves knowledge unset when retrieval fails or returns nothing", () => {
    const failed = assembleEmployeePromptKnowledge({
      mode: "webhook",
      retrieval: null,
    });
    assert.equal(failed.knowledge, undefined);
    assert.match(failed.systemInstructions[0] ?? "", /Never use another company/);
  });

  it("does not include another company's chunk that was not retrieved", () => {
    const assembled = assembleEmployeePromptKnowledge({
      mode: "webhook",
      retrieval: retrieval(companyAFact),
    });
    assert.doesNotMatch(assembled.knowledge?.contextText ?? "", /company-b/);
  });
});
