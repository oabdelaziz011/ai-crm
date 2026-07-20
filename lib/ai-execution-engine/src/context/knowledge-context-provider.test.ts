import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KnowledgeContextProvider } from "../context/knowledge-context-provider.js";

describe("KnowledgeContextProvider", () => {
  it("maps knowledge snapshots into runtime context variables", () => {
    const provider = new KnowledgeContextProvider();
    const resolved = provider.resolve({
      knowledge: {
        contextText: "[FAQ] VaultOS hours are 9am-5pm.",
        chunkCount: 1,
        totalTokens: 20,
        executionId: "exec-1",
        chunks: [{ id: "chunk-1", content: "VaultOS hours are 9am-5pm.", score: 0.9 }],
      },
    });
    assert.match(String(resolved.knowledge?.context), /VaultOS hours/);
    assert.equal(resolved.knowledge?.chunkCount, 1);
  });
});
