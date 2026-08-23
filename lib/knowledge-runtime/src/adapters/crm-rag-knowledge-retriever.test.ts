import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createCrmRagKnowledgeRetriever,
  KNOWLEDGE_RETRIEVAL_FAILED_MESSAGE,
  KNOWLEDGE_RETRIEVAL_NOT_CONFIGURED_MESSAGE,
  mapKnowledgeContextToToolResult,
  type CrmRagRetrievalConfig,
} from "./crm-rag-knowledge-retriever.js";
import type { KnowledgeContextDto } from "../dto/knowledge-context-dto.js";
import type { KnowledgeRuntimeSearchInput } from "../provider/knowledge-runtime-provider.js";
import type { KnowledgeAccessContext } from "../coordinator/knowledge-search-coordinator.js";

function emptyContext(overrides: Partial<KnowledgeContextDto> = {}): KnowledgeContextDto {
  return {
    contextText: "",
    chunks: [],
    citations: [],
    chunkCount: 0,
    totalTokens: 0,
    confidence: 0,
    executionId: "",
    vectorQueryExecutionId: "",
    searchMode: "hybrid",
    retrievalLatencyMs: 0,
    rankingLatencyMs: 0,
    policyId: null,
    cacheHit: false,
    ...overrides,
  };
}

describe("createCrmRagKnowledgeRetriever", () => {
  it("fails closed when companyId is missing", async () => {
    const retrieve = createCrmRagKnowledgeRetriever({
      knowledgeRuntime: {
        retrieveForTool: async () => {
          throw new Error("should not retrieve");
        },
      },
      resolveRetrievalConfig: async () => ({
        embeddingConnectionId: "e1",
        vectorStoreConnectionId: "v1",
        collectionId: "c1",
      }),
    });

    const result = await retrieve({ companyId: "  ", userId: "u1", query: "refund policy" });
    assert.equal(result.results.length, 0);
    assert.match(result.contextText, /Company context is required/);
  });

  it("returns not-configured when retrieval config is incomplete", async () => {
    let retrieveCalled = false;
    const retrieve = createCrmRagKnowledgeRetriever({
      knowledgeRuntime: {
        retrieveForTool: async () => {
          retrieveCalled = true;
          return emptyContext();
        },
      },
      resolveRetrievalConfig: async () => null,
    });

    const result = await retrieve({ companyId: "co-1", userId: "u1", query: "hours" });
    assert.equal(retrieveCalled, false);
    assert.equal(result.contextText, KNOWLEDGE_RETRIEVAL_NOT_CONFIGURED_MESSAGE);
  });

  it("calls retrieveForTool with trusted companyId and resolved connection ids", async () => {
    const calls: Array<{ ctx: KnowledgeAccessContext; input: KnowledgeRuntimeSearchInput }> = [];
    const config: CrmRagRetrievalConfig = {
      embeddingConnectionId: "emb-1",
      vectorStoreConnectionId: "vec-1",
      collectionId: "col-1",
    };

    const retrieve = createCrmRagKnowledgeRetriever({
      knowledgeRuntime: {
        retrieveForTool: async (ctx, input) => {
          calls.push({ ctx, input });
          return emptyContext({
            contextText: "Policy: refunds within 30 days.",
            chunkCount: 1,
            chunks: [
              {
                id: "ch1",
                chunkText: "Refunds within 30 days.",
                articleTitle: null,
                documentTitle: "Refund Policy",
                sectionTitle: null,
                sourceId: "src1",
                confidence: 0.91,
                score: 0.88,
                rank: 1,
                tokenCount: 12,
                citation: {
                  citationId: "c1",
                  chunkId: "ch1",
                  documentId: "d1",
                  documentTitle: "Refund Policy",
                  articleTitle: null,
                  sectionTitle: null,
                  pageNumber: null,
                  excerpt: "Refunds within 30 days.",
                  confidence: 0.91,
                  score: 0.88,
                  rank: 1,
                },
              },
            ],
          });
        },
      },
      resolveRetrievalConfig: async (companyId) => {
        assert.equal(companyId, "co-trusted");
        return config;
      },
    });

    const result = await retrieve({
      companyId: "co-trusted",
      userId: "actor-1",
      query: "What is the refund policy?",
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.input.companyId, "co-trusted");
    assert.equal(calls[0]!.input.embeddingConnectionId, "emb-1");
    assert.equal(calls[0]!.input.vectorStoreConnectionId, "vec-1");
    assert.equal(calls[0]!.input.collectionId, "col-1");
    assert.equal(calls[0]!.ctx.companyId, "co-trusted");
    assert.equal(calls[0]!.ctx.isSuperAdmin, false);
    assert.equal(calls[0]!.ctx.hasPermission("retrieval.execute"), true);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0]!.title, "Refund Policy");
    assert.match(result.contextText, /refunds within 30 days/i);
  });

  it("never lets resolve config company override trusted companyId on retrieve", async () => {
    const retrieve = createCrmRagKnowledgeRetriever({
      knowledgeRuntime: {
        retrieveForTool: async (_ctx, input) => {
          assert.equal(input.companyId, "co-trusted");
          return emptyContext();
        },
      },
      resolveRetrievalConfig: async () => ({
        embeddingConnectionId: "emb-other",
        vectorStoreConnectionId: "vec-other",
        collectionId: "col-other",
      }),
    });

    await retrieve({ companyId: "co-trusted", userId: "u1", query: "policy" });
  });

  it("returns controlled failure when retrieveForTool throws", async () => {
    const retrieve = createCrmRagKnowledgeRetriever({
      knowledgeRuntime: {
        retrieveForTool: async () => {
          throw new Error("vector store down");
        },
      },
      resolveRetrievalConfig: async () => ({
        embeddingConnectionId: "e",
        vectorStoreConnectionId: "v",
        collectionId: "c",
      }),
    });

    const result = await retrieve({ companyId: "co-1", userId: "u1", query: "help" });
    assert.equal(result.results.length, 0);
    assert.match(result.contextText, new RegExp(KNOWLEDGE_RETRIEVAL_FAILED_MESSAGE));
    assert.match(result.contextText, /vector store down/);
  });

  it("maps knowledge context into tool results", () => {
    const mapped = mapKnowledgeContextToToolResult(
      emptyContext({
        contextText: "assembled",
        chunkCount: 1,
        chunks: [
          {
            id: "1",
            chunkText: "Hello world content",
            articleTitle: null,
            documentTitle: "Doc A",
            sectionTitle: null,
            sourceId: "s",
            confidence: 0.7,
            score: 0.6,
            rank: 1,
            tokenCount: 3,
            citation: {
              citationId: "x",
              chunkId: "1",
              documentId: "d",
              documentTitle: "Doc A",
              articleTitle: null,
              sectionTitle: null,
              pageNumber: null,
              excerpt: "Hello",
              confidence: 0.7,
              score: 0.6,
              rank: 1,
            },
          },
        ],
      }),
    );
    assert.equal(mapped.results[0]!.title, "Doc A");
    assert.equal(mapped.contextText, "assembled");
  });
});
