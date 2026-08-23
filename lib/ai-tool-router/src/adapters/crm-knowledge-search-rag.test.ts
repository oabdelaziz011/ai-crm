import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSupabaseCrmAgentToolPorts } from "./supabase-crm-agent-tool-ports.js";
import { createCrmAgentTools } from "../tools/crm-agent-tools.js";
import type { ToolExecutionContext } from "../tools/tool-contract.js";

function makeClient(rpcCalls: Array<Record<string, unknown>>) {
  return {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, ...args });
      return { data: [], error: null };
    },
    from: () => {
      throw new Error("unexpected from()");
    },
  } as never;
}

function toolContext(overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext {
  return {
    companyId: "co-1",
    userId: "user-1",
    conversationId: "conv-1",
    conversationState: "idle",
    ...overrides,
  };
}

describe("CRM knowledge_search RAG wiring (Phase 5K.1)", () => {
  it("uses retrieveKnowledge and never calls knowledge_keyword_search RPC", async () => {
    const rpcCalls: Array<Record<string, unknown>> = [];
    let retrieveCalls = 0;
    const ports = createSupabaseCrmAgentToolPorts(makeClient(rpcCalls), {
      retrieveKnowledge: async (input) => {
        retrieveCalls += 1;
        assert.equal(input.companyId, "co-1");
        assert.equal(input.query, "refund policy");
        return {
          results: [{ title: "Policy", excerpt: "30 days", confidence: 0.9 }],
          contextText: "30 days refund",
        };
      },
    });

    const result = await ports.knowledgeSearch({
      companyId: "co-1",
      userId: "user-1",
      query: "refund policy",
    });

    assert.equal(retrieveCalls, 1);
    assert.equal(rpcCalls.length, 0);
    assert.equal(result.results[0]!.title, "Policy");
    assert.match(result.contextText, /30 days/);
  });

  it("fails closed without retrieveKnowledge (no keyword fallback)", async () => {
    const rpcCalls: Array<Record<string, unknown>> = [];
    const ports = createSupabaseCrmAgentToolPorts(makeClient(rpcCalls));
    const result = await ports.knowledgeSearch({
      companyId: "co-1",
      userId: "user-1",
      query: "anything",
    });
    assert.equal(rpcCalls.length, 0);
    assert.equal(result.results.length, 0);
    assert.match(result.contextText, /no retrieval provider configured/i);
  });

  it("fails closed when companyId is missing", async () => {
    const ports = createSupabaseCrmAgentToolPorts(makeClient([]), {
      retrieveKnowledge: async () => {
        throw new Error("should not run");
      },
    });
    await assert.rejects(
      () =>
        ports.knowledgeSearch({
          companyId: "",
          userId: "user-1",
          query: "q",
        }),
      /Company context is required/,
    );
  });

  it("knowledge_search tool passes trusted context companyId only", async () => {
    const seen: Array<{ companyId: string; query: string }> = [];
    const ports = createSupabaseCrmAgentToolPorts(makeClient([]), {
      retrieveKnowledge: async (input) => {
        seen.push({ companyId: input.companyId, query: input.query });
        return { results: [{ title: "A", excerpt: "B", confidence: 1 }], contextText: "B" };
      },
    });
    const tools = createCrmAgentTools(ports);
    const tool = tools.knowledge_search;

    const result = await tool.execute(toolContext({ companyId: "co-trusted" }), {
      query: "hours",
      companyId: "co-llm-spoof",
    });

    assert.equal(seen.length, 1);
    assert.equal(seen[0]!.companyId, "co-trusted");
    assert.equal(seen[0]!.query, "hours");
    assert.equal((result as { success: boolean }).success, true);
    assert.deepEqual((result as { results: unknown[] }).results, [
      { title: "A", excerpt: "B", confidence: 1 },
    ]);
  });

  it("knowledge_search tool fails closed without company context", async () => {
    const ports = createSupabaseCrmAgentToolPorts(makeClient([]), {
      retrieveKnowledge: async () => ({ results: [], contextText: "x" }),
    });
    const tools = createCrmAgentTools(ports);
    await assert.rejects(
      () => tools.knowledge_search.execute(toolContext({ companyId: "   " }), { query: "x" }),
      /Company context is required/,
    );
  });
});
