import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PermissionDeniedError, ValidationError } from "../errors.js";
import type { QueryEmbeddingPort } from "../ports/query-embedding-port.js";
import type { VectorQueryExecutionPort } from "../ports/vector-query-execution-port.js";
import { RetrievalOrchestrationEngine } from "./retrieval-orchestration-engine.js";
import { createContext, createTestEnvironment } from "./test-utils.js";

function createOrchestrationEnvironment() {
  const env = createTestEnvironment();
  let embeddingCalls = 0;
  let vectorQueryCalls = 0;

  const queryEmbeddingPort: QueryEmbeddingPort = {
    async generateQueryEmbedding(_ctx, input) {
      embeddingCalls += 1;
      return {
        vector: [0.12, 0.34, 0.56, 0.78],
        dimensions: 4,
        providerKey: "openai",
        model: input.model ?? "text-embedding-3-small",
        mock: true,
      };
    },
  };

  const vectorQueryPort: VectorQueryExecutionPort = {
    async executeVectorQuery(_ctx, input) {
      vectorQueryCalls += 1;
      assert.deepEqual(input.queryVector, [0.12, 0.34, 0.56, 0.78]);
      return {
        executionId: "vq-exec-1",
        correlationId: input.correlationId ?? null,
        executionTimeMs: 12,
        provider: "pgvector",
        collectionId: input.collectionId,
        policyId: input.policyId ?? null,
        resultCount: 2,
      };
    },
  };

  const orchestration = new RetrievalOrchestrationEngine(
    queryEmbeddingPort,
    vectorQueryPort,
    env.retrieval,
  );

  return {
    ...env,
    orchestration,
    getEmbeddingCalls: () => embeddingCalls,
    getVectorQueryCalls: () => vectorQueryCalls,
  };
}

describe("RetrievalOrchestrationEngine", () => {
  it("executes question → embedding → vector query → context assembly", async () => {
    const env = createOrchestrationEnvironment();
    const ctx = createContext();

    const response = await env.orchestration.retrieveFromQuestion(ctx, {
      companyId: "company-1",
      question: "What is the enterprise security policy?",
      embeddingConnectionId: "embedding-conn-1",
      vectorStoreConnectionId: "vector-conn-1",
      collectionId: "collection-1",
      correlationId: "corr-semantic-1",
    });

    assert.equal(response.correlationId, "corr-semantic-1");
    assert.equal(response.vectorQueryExecutionId, "vq-exec-1");
    assert.equal(response.queryEmbedding.providerKey, "openai");
    assert.equal(response.queryEmbedding.dimensions, 4);
    assert.ok(response.context.chunks.length > 0);
    assert.ok(response.metrics.chunksSelected > 0);
    assert.ok(response.orchestrationTimeMs >= 0);
    assert.equal(env.getEmbeddingCalls(), 1);
    assert.equal(env.getVectorQueryCalls(), 1);
    assert.equal(env.executions.length, 1);
    assert.equal(env.contexts.length, 1);
  });

  it("passes metadata filters and score thresholds to vector query port", async () => {
    const env = createOrchestrationEnvironment();
    const ctx = createContext();
    let capturedMinimumScore: number | undefined;
    let capturedFilters: Record<string, unknown> | undefined;

    const vectorQueryPort: VectorQueryExecutionPort = {
      async executeVectorQuery(_ctx, input) {
        capturedMinimumScore = input.minimumScore;
        capturedFilters = input.metadataFilters;
        return {
          executionId: "vq-exec-1",
          correlationId: null,
          executionTimeMs: 5,
          provider: "pgvector",
          collectionId: input.collectionId,
          policyId: null,
          resultCount: 2,
        };
      },
    };

    const orchestration = new RetrievalOrchestrationEngine(
      {
        async generateQueryEmbedding() {
          return {
            vector: [0.1, 0.2, 0.3, 0.4],
            dimensions: 4,
            providerKey: "openai",
            model: "text-embedding-3-small",
          };
        },
      },
      vectorQueryPort,
      env.retrieval,
    );

    await orchestration.retrieveFromQuestion(ctx, {
      companyId: "company-1",
      question: "Security policy MFA requirements",
      embeddingConnectionId: "embedding-conn-1",
      vectorStoreConnectionId: "vector-conn-1",
      collectionId: "collection-1",
      minimumScore: 0.5,
      metadataFilters: { document_type: "policy" },
    });

    assert.equal(capturedMinimumScore, 0.5);
    assert.deepEqual(capturedFilters, { document_type: "policy" });
  });

  it("requires execute permission", async () => {
    const env = createOrchestrationEnvironment();
    const ctx = createContext({ hasPermission: (code) => code === "retrieval.view" });

    await assert.rejects(
      () =>
        env.orchestration.retrieveFromQuestion(ctx, {
          companyId: "company-1",
          question: "test",
          embeddingConnectionId: "embedding-conn-1",
          vectorStoreConnectionId: "vector-conn-1",
          collectionId: "collection-1",
        }),
      PermissionDeniedError,
    );
  });

  it("rejects empty questions", async () => {
    const env = createOrchestrationEnvironment();
    const ctx = createContext();

    await assert.rejects(
      () =>
        env.orchestration.retrieveFromQuestion(ctx, {
          companyId: "company-1",
          question: "   ",
          embeddingConnectionId: "embedding-conn-1",
          vectorStoreConnectionId: "vector-conn-1",
          collectionId: "collection-1",
        }),
      ValidationError,
    );
  });
});
