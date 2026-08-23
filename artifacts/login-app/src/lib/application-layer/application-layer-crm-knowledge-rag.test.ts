import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createApplicationLayerCrmAgentToolPorts } from "./application-layer-crm-agent-tool-ports.js";

describe("login-app knowledge_search RAG path (Phase 5K.1)", () => {
  it("uses injected retrieveKnowledge with trusted portContext companyId", async () => {
    const seen: Array<{ companyId: string; query: string }> = [];
    const ports = createApplicationLayerCrmAgentToolPorts({
      portContext: {
        companyId: "co-login",
        actorUserId: "user-1",
        isSuperAdmin: false,
        hasPermission: () => true,
      },
      retrieveKnowledge: async (input) => {
        seen.push({ companyId: input.companyId, query: input.query });
        return {
          results: [{ title: "FAQ", excerpt: "We open at 9", confidence: 0.8 }],
          contextText: "We open at 9",
        };
      },
    });

    const result = await ports.knowledgeSearch({
      companyId: "co-login",
      userId: "user-1",
      query: "opening hours",
    });

    assert.equal(seen.length, 1);
    assert.equal(seen[0]!.companyId, "co-login");
    assert.equal(result.results[0]!.title, "FAQ");
    assert.match(result.contextText, /open at 9/);
  });

  it("rejects cross-company companyId spoof when not super-admin", async () => {
    let retrieveCalled = false;
    const ports = createApplicationLayerCrmAgentToolPorts({
      portContext: {
        companyId: "co-login",
        actorUserId: "user-1",
        isSuperAdmin: false,
        hasPermission: () => true,
      },
      retrieveKnowledge: async () => {
        retrieveCalled = true;
        return { results: [], contextText: "should not run" };
      },
    });

    const result = await ports.knowledgeSearch({
      companyId: "co-other",
      userId: "user-1",
      query: "secret",
    });

    assert.equal(retrieveCalled, false);
    assert.equal(result.results.length, 0);
    assert.match(result.contextText, /Company context is required/);
  });

  it("returns unavailable when retrieveKnowledge is not injected", async () => {
    const ports = createApplicationLayerCrmAgentToolPorts({
      portContext: {
        companyId: "co-login",
        actorUserId: "user-1",
        isSuperAdmin: false,
        hasPermission: () => true,
      },
    });
    const result = await ports.knowledgeSearch({
      companyId: "co-login",
      userId: "user-1",
      query: "x",
    });
    assert.match(result.contextText, /no retrieval provider configured/i);
  });
});
