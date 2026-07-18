import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestEnvironment } from "./test-utils.js";

describe("RetrievalMetricsEngine", () => {
  it("computes retrieval metrics snapshot", () => {
    const env = createTestEnvironment();
    const startedAt = Date.now() - 25;
    const metrics = env.metrics.computeMetrics({
      startedAt,
      policy: {
        policyId: "policy-1",
        maxContextTokens: 500,
        maxChunks: 3,
        windowExpansion: 0,
        minSourceDiversity: 1,
        overlapRemovalThreshold: 0.85,
        defaultLanguage: "en",
        sourcePriority: {},
        departmentPriority: {},
        chunkSelectionStrategy: "score_first",
        metadata: {},
      },
      selectedCount: 2,
      rejectedCount: 1,
      discardedBudget: 0,
      assembledChunks: [
        {
          knowledgeChunkId: "chunk-1",
          indexedVectorId: "indexed-1",
          normalizedScore: 0.9,
          ranking: 1,
          content: "A",
          tokenCount: 5,
          documentId: "doc-1",
          sourceId: "source-1",
          sourceKey: "policy",
          sourceType: "policy",
          department: null,
          language: "en",
          metadata: {},
          selectionReason: "score",
          included: true,
          selectionRank: 1,
          references: {
            documentId: "doc-1",
            sourceId: "source-1",
            knowledgeChunkId: "chunk-1",
            indexedVectorId: "indexed-1",
          },
        },
      ],
    });

    assert.equal(metrics.chunksSelected, 2);
    assert.equal(metrics.chunksRejected, 1);
    assert.equal(metrics.budgetUsedTokens, 5);
    assert.ok(metrics.durationMs >= 0);
  });
});
