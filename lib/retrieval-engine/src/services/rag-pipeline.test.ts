import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fuseHybridResults } from "../services/hybrid-search-service.js";
import { rerankChunks } from "../services/reranking-service.js";
import { buildCitations } from "../services/citation-engine.js";
import { computeRetrievalConfidence } from "../services/confidence-scoring.js";

describe("HybridSearchService", () => {
  it("merges vector and keyword hits via RRF", () => {
    const fused = fuseHybridResults({
      vectorChunks: [
        { id: "a", content: "vector hit", score: 0.9, rank: 1, tokenCount: 10, metadata: {} },
        { id: "b", content: "vector only", score: 0.7, rank: 2, tokenCount: 10, metadata: {} },
      ],
      keywordHits: [
        {
          chunkId: "a",
          documentId: "doc-1",
          sourceId: "src-1",
          documentTitle: "Policy",
          sectionTitle: "Hours",
          content: "vector hit",
          score: 0.8,
          pageNumber: 2,
          rank: 1,
        },
        {
          chunkId: "c",
          documentId: "doc-2",
          sourceId: "src-1",
          documentTitle: "FAQ",
          sectionTitle: "",
          content: "keyword only",
          score: 0.6,
          pageNumber: null,
          rank: 2,
        },
      ],
    });

    assert.equal(fused.length, 3);
    assert.equal(fused[0].id, "a");
  });
});

describe("RerankingService", () => {
  it("boosts chunks with query term overlap", () => {
    const reranked = rerankChunks({
      query: "business hours policy",
      chunks: [
        {
          id: "1",
          content: "Our business hours are 9-5.",
          score: 0.5,
          rank: 2,
          tokenCount: 8,
          documentTitle: "Policy",
          metadata: { sectionTitle: "Hours" },
        },
        {
          id: "2",
          content: "Unrelated content.",
          score: 0.9,
          rank: 1,
          tokenCount: 4,
          metadata: {},
        },
      ],
    });

    assert.equal(reranked[0].id, "1");
  });
});

describe("CitationEngine", () => {
  it("builds structured citations with confidence", () => {
    const citations = buildCitations([
      {
        id: "chunk-1",
        content: "Business hours are 9 AM to 5 PM weekdays.",
        score: 0.82,
        rank: 1,
        tokenCount: 12,
        documentTitle: "Employee Handbook",
        metadata: { documentId: "doc-1", pageNumber: 4, sectionTitle: "Schedule" },
      },
    ]);

    assert.equal(citations[0].citationId, "cite-1");
    assert.equal(citations[0].pageNumber, 4);
    assert.ok(citations[0].confidence > 0);
    assert.ok(computeRetrievalConfidence([{ id: "chunk-1", content: "x", score: 0.8, rank: 1, tokenCount: 1, metadata: {} }]) > 0);
  });
});
