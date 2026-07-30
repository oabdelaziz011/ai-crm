import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deduplicateChunks } from "../ranking/knowledge-chunk-ranker.js";
import { KnowledgeChunkRanker } from "../ranking/knowledge-chunk-ranker.js";
import { normalizeKnowledgeQuery } from "../utils/query-normalizer.js";

describe("KnowledgeChunkRanker", () => {
  it("deduplicates near-identical chunk content", () => {
    const chunks = deduplicateChunks([
      {
        id: "a",
        content: "Our refund policy allows returns within 30 days of purchase.",
        score: 0.9,
        rank: 1,
        tokenCount: 10,
        metadata: {},
      },
      {
        id: "b",
        content: "Our refund policy allows returns within 30 days of purchase.",
        score: 0.8,
        rank: 2,
        tokenCount: 10,
        metadata: {},
      },
    ]);
    assert.equal(chunks.length, 1);
  });

  it("applies minimum score threshold", () => {
    const ranker = new KnowledgeChunkRanker();
    const ranked = ranker.rank({
      chunks: [
        { id: "1", content: "high", score: 0.8, rank: 1, tokenCount: 5, metadata: {} },
        { id: "2", content: "low", score: 0.1, rank: 2, tokenCount: 5, metadata: {} },
      ],
      query: "refund policy",
      searchMode: "vector",
      minimumScore: 0.2,
    });
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0]?.id, "1");
  });
});

describe("query normalizer", () => {
  it("normalizes questions for cache keys", () => {
    assert.equal(normalizeKnowledgeQuery("  What is your refund policy??  "), "what is your refund policy");
  });
});
