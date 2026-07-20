import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createAIWorkflowPlatformServices,
  createDefaultKnowledgeSearchNodeConfig,
  patchKnowledgeSearchMetadata,
  toAIWorkflowEngineConfig,
  validateKnowledgeSearchQuery,
  validateKnowledgeSearchRetrievalConfig,
  mapKnowledgeSearchResult,
} from "../../index.js";

describe("Knowledge search configuration validation", () => {
  it("requires a search query for static input", () => {
    const config = patchKnowledgeSearchMetadata(createDefaultKnowledgeSearchNodeConfig(), {
      inputSource: "static",
      staticQuery: "",
    });
    assert.ok(validateKnowledgeSearchQuery(config).some((issue) => issue.code === "missing_search_query"));
  });

  it("requires collection and retrieval connections", () => {
    const config = createDefaultKnowledgeSearchNodeConfig();
    const issues = validateKnowledgeSearchRetrievalConfig(config);
    assert.ok(issues.some((issue) => issue.code === "missing_knowledge_collection"));
    assert.ok(issues.some((issue) => issue.code === "missing_knowledge_connections"));
  });

  it("validates top K bounds", () => {
    const config = patchKnowledgeSearchMetadata(createDefaultKnowledgeSearchNodeConfig(), { topK: 0 });
    assert.ok(validateKnowledgeSearchRetrievalConfig(config).some((issue) => issue.code === "invalid_top_k"));
  });
});

describe("Knowledge search result mapping", () => {
  it("maps retrieval chunks into structured workflow output", () => {
    const config = createDefaultKnowledgeSearchNodeConfig();
    config.knowledge = {
      enabled: true,
      collectionId: "col-1",
      embeddingConnectionId: "emb-1",
      vectorStoreConnectionId: "vec-1",
      maxChunks: 8,
      similarityThreshold: 0.7,
      queryTemplate: null,
    };
    const payload = mapKnowledgeSearchResult(
      {
        contextText: "Policy summary",
        chunks: [
          {
            id: "chunk-1",
            content: "Security policy details",
            score: 0.91,
            rank: 1,
            tokenCount: 42,
            documentTitle: "Security Policy",
            metadata: { documentId: "doc-1", sourceId: "kb://security" },
          },
        ],
        chunkCount: 1,
        totalTokens: 42,
        executionId: "ret-1",
        vectorQueryExecutionId: "vq-1",
        retrievalLatencyMs: 15,
        rankingLatencyMs: 3,
        policyId: "default",
      },
      config,
    );
    assert.equal(payload.summary, "Policy summary");
    assert.equal(payload.documents.length, 1);
    assert.equal(payload.chunks[0]?.content, "Security policy details");
    assert.equal(payload.metadata.averageSimilarity, 0.91);
  });
});

describe("AI Knowledge Search node execution", () => {
  it("executes retrieval through the shared framework without LLM gateway", async () => {
    const services = createAIWorkflowPlatformServices({
      registerBuiltIns: true,
      runtime: {
        async buildPrompt() {
          throw new Error("LLM gateway should not be invoked for retrieval-only nodes");
        },
        async execute() {
          throw new Error("LLM gateway should not be invoked for retrieval-only nodes");
        },
      },
      knowledge: {
        async retrieve(_ctx, input) {
          assert.equal(input.question, "What is the refund policy?");
          return {
            contextText: "Refunds within 30 days.",
            chunks: [
              {
                id: "chunk-refund",
                content: "Refunds are available within 30 days of purchase.",
                score: 0.88,
                rank: 1,
                tokenCount: 18,
                documentTitle: "Refund Policy",
                metadata: { documentId: "doc-refund", sourceId: "kb://policies" },
              },
            ],
            chunkCount: 1,
            totalTokens: 18,
            executionId: "exec-knowledge-1",
            vectorQueryExecutionId: "vq-knowledge-1",
            retrievalLatencyMs: 21,
            rankingLatencyMs: 4,
            policyId: "default",
          };
        },
      },
    });

    const bridge = services.createRuntimeBridge(() => ({
      userId: "u1",
      companyId: "c1",
      isSuperAdmin: false,
      hasPermission: () => true,
    }));

    const config = createDefaultKnowledgeSearchNodeConfig();
    config.knowledge = {
      enabled: true,
      collectionId: "col-policies",
      embeddingConnectionId: "emb-1",
      vectorStoreConnectionId: "vec-1",
      maxChunks: 8,
      similarityThreshold: 0.7,
      queryTemplate: null,
    };

    const result = await bridge.executeNode({
      company: { id: "c1" },
      flow: { id: "flow-1" },
      run: { id: "run-1" },
      session: { id: "session-1" },
      variables: { input: "What is the refund policy?" },
      customer: { id: null },
      currentNode: { config: toAIWorkflowEngineConfig(config) },
    });

    assert.equal(result.outcome, "continue");
    const knowledgeResult = (result.variables as Record<string, unknown>).knowledge_result as {
      mode: string;
      value: { summary: string; chunks: Array<{ content: string }> };
    };
    assert.equal(knowledgeResult.mode, "structured");
    assert.equal(knowledgeResult.value.summary, "Refunds within 30 days.");
    assert.equal(knowledgeResult.value.chunks[0]?.content, "Refunds are available within 30 days of purchase.");

    const metadata = (result.variables as Record<string, unknown>).__aiLastExecution as {
      knowledgeSearchExecutionId: string;
      knowledgeChunkCount: number;
      providerKey: string;
    };
    assert.equal(metadata.knowledgeSearchExecutionId, "exec-knowledge-1");
    assert.equal(metadata.knowledgeChunkCount, 1);
    assert.equal(metadata.providerKey, "knowledge");

    const events = services.observability.list().map((event) => event.type);
    assert.ok(events.includes("knowledge_search_started"));
    assert.ok(events.includes("retrieval_started"));
    assert.ok(events.includes("retrieval_completed"));
    assert.ok(events.includes("results_ranked"));
    assert.ok(events.includes("knowledge_search_completed"));
    assert.equal(events.includes("gateway_started"), false);
  });
});
