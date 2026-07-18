import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestEnvironment } from "./test-utils.js";

describe("ContextBudgetEngine", () => {
  it("enforces token and chunk limits", () => {
    const env = createTestEnvironment();
    const policy = {
      policyId: "policy-1",
      maxContextTokens: 15,
      maxChunks: 1,
      windowExpansion: 0,
      minSourceDiversity: 1,
      overlapRemovalThreshold: 0.85,
      defaultLanguage: null,
      sourcePriority: {},
      departmentPriority: {},
      chunkSelectionStrategy: "score_first" as const,
      metadata: {},
    };

    const { included, discardedBudget } = env.budget.enforceBudget(
      [
        {
          knowledgeChunkId: "chunk-1",
          indexedVectorId: "indexed-1",
          normalizedScore: 0.9,
          ranking: 1,
          content: "first chunk content",
          tokenCount: 10,
          documentId: "doc-1",
          sourceId: "source-1",
          sourceKey: "policy",
          sourceType: "policy",
          department: null,
          language: "en",
          metadata: {},
          selectionReason: "score",
        },
        {
          knowledgeChunkId: "chunk-2",
          indexedVectorId: "indexed-2",
          normalizedScore: 0.8,
          ranking: 2,
          content: "second chunk content",
          tokenCount: 10,
          documentId: "doc-2",
          sourceId: "source-2",
          sourceKey: "faq",
          sourceType: "faq",
          department: null,
          language: "en",
          metadata: {},
          selectionReason: "score",
        },
      ],
      policy,
    );

    const accepted = included.filter((item) => item.included);
    assert.equal(accepted.length, 1);
    assert.ok(discardedBudget >= 1);
  });
});
