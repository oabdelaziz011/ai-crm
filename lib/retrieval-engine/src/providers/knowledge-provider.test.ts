import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDefaultKnowledgePolicyRegistry,
  createDefaultKnowledgeRankingRegistry,
  mapSemanticRetrievalResponse,
} from "../providers/knowledge-provider.js";
import type { SemanticRetrievalResponse } from "../dto/retrieval-dto.js";
import { KnowledgeObservability } from "../observability/knowledge-observability.js";

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
    chunkCount: 2,
    totalTokens: 40,
    metadata: {},
    chunks: [
      {
        knowledgeChunkId: "chunk-1",
        indexedVectorId: "vec-1",
        selectionRank: 1,
        normalizedScore: 0.91,
        tokenCount: 20,
        content: "VaultOS hours are 9am-5pm.",
        metadata: { documentTitle: "FAQ" },
        references: { documentId: "doc-1", sourceId: "src-1" },
      },
      {
        knowledgeChunkId: "chunk-2",
        indexedVectorId: "vec-2",
        selectionRank: 2,
        normalizedScore: 0.75,
        tokenCount: 20,
        content: "Support is available weekdays.",
        metadata: { documentTitle: "Support" },
        references: { documentId: "doc-2", sourceId: "src-1" },
      },
    ],
  },
  metrics: {
    chunksSelected: 2,
    chunksRejected: 0,
    chunksDiscardedBudget: 0,
    budgetTokens: 2048,
    budgetUsedTokens: 40,
  },
};

describe("KnowledgeProvider utilities", () => {
  it("maps semantic retrieval responses into runtime knowledge snapshots", () => {
    const snapshots = sampleResponse.context.chunks.map((chunk) => ({
      id: chunk.knowledgeChunkId,
      content: chunk.content,
      score: chunk.normalizedScore,
      rank: chunk.selectionRank,
      tokenCount: chunk.tokenCount,
      documentTitle: chunk.metadata.documentTitle as string,
      metadata: chunk.metadata,
    }));
    const mapped = mapSemanticRetrievalResponse(sampleResponse, snapshots, "hybrid");
    assert.equal(mapped.chunkCount, 2);
    assert.match(mapped.contextText, /VaultOS hours/);
    assert.equal(mapped.executionId, "exec-1");
    assert.equal(mapped.citations.length, 2);
  });

  it("applies knowledge policies and ranking strategies", () => {
    const policies = createDefaultKnowledgePolicyRegistry();
    const ranking = createDefaultKnowledgeRankingRegistry();
    const policy = policies.resolve("default");
    const snapshots = sampleResponse.context.chunks.map((chunk) => ({
      id: chunk.knowledgeChunkId,
      content: chunk.content,
      score: chunk.normalizedScore,
      rank: chunk.selectionRank,
      tokenCount: chunk.tokenCount,
      documentTitle: chunk.metadata.documentTitle as string,
      metadata: chunk.metadata,
    }));
    const chunks = mapSemanticRetrievalResponse(sampleResponse, snapshots, "vector").chunks;
    const ranked = ranking.apply(policy.rankingStrategy, chunks).slice(0, policy.maxChunks);
    assert.equal(ranked.length, 2);
    assert.ok((ranked[0]?.score ?? 0) >= (ranked[1]?.score ?? 0));
  });
});

describe("Knowledge observability", () => {
  it("records structured knowledge events", () => {
    const observability = new KnowledgeObservability();
    observability.record({
      type: "retrieval_completed",
      companyId: "company-1",
      executionId: "exec-1",
      metrics: { latencyMs: 20, chunkCount: 2 },
    });
    assert.equal(observability.summary("company-1").retrievalEvents, 1);
  });
});
