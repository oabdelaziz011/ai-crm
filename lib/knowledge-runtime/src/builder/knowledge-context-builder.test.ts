import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapSemanticRetrievalResponse } from "@workspace/retrieval-engine";
import type { SemanticRetrievalResponse } from "@workspace/retrieval-engine";
import { KnowledgeContextBuilder } from "../builder/knowledge-context-builder.js";

const sampleResponse: SemanticRetrievalResponse = {
  executionId: "exec-1",
  correlationId: "corr-1",
  executionTimeMs: 20,
  policyId: "policy-1",
  vectorQueryExecutionId: "vq-1",
  orchestrationTimeMs: 25,
  queryEmbedding: { dimensions: 8, providerKey: "mock", model: "mock-embed" },
  context: {
    contextId: "ctx-1",
    executionId: "exec-1",
    chunkCount: 1,
    totalTokens: 20,
    metadata: {},
    chunks: [
      {
        knowledgeChunkId: "chunk-1",
        indexedVectorId: "vec-1",
        selectionRank: 1,
        normalizedScore: 0.91,
        tokenCount: 20,
        content: "Refunds are available within 30 days when items are unused.",
        metadata: { documentTitle: "Refund Policy", sectionTitle: "Returns" },
        references: { documentId: "doc-1", sourceId: "src-1" },
      },
    ],
  },
  metrics: {
    chunksSelected: 1,
    chunksRejected: 0,
    chunksDiscardedBudget: 0,
    budgetTokens: 2048,
    budgetUsedTokens: 20,
  },
};

describe("KnowledgeContextBuilder", () => {
  it("builds normalized DTOs without raw database rows", () => {
    const snapshots = sampleResponse.context.chunks.map((chunk) => ({
      id: chunk.knowledgeChunkId,
      content: chunk.content,
      score: chunk.normalizedScore,
      rank: chunk.selectionRank,
      tokenCount: chunk.tokenCount,
      documentTitle: chunk.metadata.documentTitle as string,
      metadata: chunk.metadata,
    }));
    const queryResult = mapSemanticRetrievalResponse(sampleResponse, snapshots, "hybrid");
    const builder = new KnowledgeContextBuilder();
    const context = builder.build(queryResult, { query: "What is your refund policy?" });

    assert.equal(context.chunkCount, 1);
    assert.match(context.contextText, /Refund Policy/);
    assert.equal(context.chunks[0]?.documentTitle, "Refund Policy");
    assert.equal(context.chunks[0]?.sectionTitle, "Returns");
    assert.equal(context.citations[0]?.chunkId, "chunk-1");
    assert.ok(context.confidence > 0);

    const snapshot = builder.toRetrievalSnapshot(context);
    assert.equal(snapshot.chunks[0]?.metadata.knowledgeChunkId, "chunk-1");
    assert.equal(snapshot.citations.length, 1);
  });
});
