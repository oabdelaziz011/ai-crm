import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createCrmRagKnowledgeRetriever,
  KNOWLEDGE_RETRIEVAL_NOT_CONFIGURED_MESSAGE,
} from "@workspace/knowledge-runtime";
import { createWebhookToolRouterIntegrations } from "./create-webhook-tool-router-integrations.js";
import { createWebhookAiEmployeeServiceContext } from "./webhook-ai-employee-auth-context.js";

/**
 * Phase 5K.1 — proves webhook ToolRouter `knowledge_search` uses the RAG retriever
 * abstraction (not keyword RPC). Embedding/vector providers are mocked.
 */
describe("webhook knowledge_search RAG wiring (Phase 5K.1)", () => {
  it("routes knowledge_search through retrieveKnowledge (RAG) and not keyword RPC", async () => {
    const rpcCalls: string[] = [];
    const mockClient = {
      rpc: async (name: string) => {
        rpcCalls.push(name);
        return { data: null, error: null };
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    };

    let retrieveForToolCalls = 0;
    const retrieveKnowledge = createCrmRagKnowledgeRetriever({
      knowledgeRuntime: {
        retrieveForTool: async (ctx, input) => {
          retrieveForToolCalls += 1;
          assert.equal(ctx.companyId, "co-webhook");
          assert.equal(input.companyId, "co-webhook");
          assert.equal(input.embeddingConnectionId, "emb-1");
          assert.equal(input.collectionId, "col-1");
          return {
            contextText: "RAG excerpt: store hours 9-5",
            chunks: [
              {
                id: "ch1",
                chunkText: "Store hours are 9-5.",
                articleTitle: null,
                documentTitle: "Hours",
                sectionTitle: null,
                sourceId: "s1",
                confidence: 0.95,
                score: 0.9,
                rank: 1,
                tokenCount: 8,
                citation: {
                  citationId: "c1",
                  chunkId: "ch1",
                  documentId: "d1",
                  documentTitle: "Hours",
                  articleTitle: null,
                  sectionTitle: null,
                  pageNumber: null,
                  excerpt: "Store hours are 9-5.",
                  confidence: 0.95,
                  score: 0.9,
                  rank: 1,
                },
              },
            ],
            citations: [],
            chunkCount: 1,
            totalTokens: 8,
            confidence: 0.95,
            executionId: "exec-1",
            vectorQueryExecutionId: "vq-1",
            searchMode: "hybrid",
            retrievalLatencyMs: 1,
            rankingLatencyMs: 1,
            policyId: null,
            cacheHit: false,
          };
        },
      },
      resolveRetrievalConfig: async (companyId) => {
        assert.equal(companyId, "co-webhook");
        return {
          embeddingConnectionId: "emb-1",
          vectorStoreConnectionId: "vec-1",
          collectionId: "col-1",
        };
      },
    });

    const { createOptions } = createWebhookToolRouterIntegrations(mockClient as never, {
      retrieveKnowledge,
    });
    assert.ok(createOptions.crmAgentPorts);

    const result = await createOptions.crmAgentPorts!.knowledgeSearch({
      companyId: "co-webhook",
      userId: "actor-1",
      query: "what are your hours?",
    });

    assert.equal(retrieveForToolCalls, 1);
    assert.equal(rpcCalls.includes("knowledge_keyword_search"), false);
    assert.equal(result.results[0]!.title, "Hours");
    assert.match(result.contextText, /store hours/i);
  });

  it("returns safe unavailable when retrieval config is missing", async () => {
    const retrieveKnowledge = createCrmRagKnowledgeRetriever({
      knowledgeRuntime: {
        retrieveForTool: async () => {
          throw new Error("should not run");
        },
      },
      resolveRetrievalConfig: async () => null,
    });

    const { createOptions } = createWebhookToolRouterIntegrations(
      { from: () => ({}), rpc: async () => ({ data: null, error: null }) } as never,
      { retrieveKnowledge },
    );

    const result = await createOptions.crmAgentPorts!.knowledgeSearch({
      companyId: "co-1",
      userId: "u1",
      query: "policy",
    });
    assert.equal(result.results.length, 0);
    assert.equal(result.contextText, KNOWLEDGE_RETRIEVAL_NOT_CONFIGURED_MESSAGE);
  });

  it("webhook product context still includes knowledge.view for ToolRouter RBAC", () => {
    const ctx = createWebhookAiEmployeeServiceContext({
      companyId: "co-1",
      userId: "u1",
    });
    assert.equal(ctx.isSuperAdmin, false);
    assert.equal(ctx.hasPermission("knowledge.view"), true);
    assert.equal(ctx.hasPermission("tools.execute"), true);
  });
});
