import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestEnvironment } from "./test-utils.js";

describe("ContextAssemblyEngine", () => {
  it("assembles ordered context with references and checksum", () => {
    const env = createTestEnvironment();
    const { chunks, contextChecksum, totalTokens } = env.assembly.assemble([
      {
        knowledgeChunkId: "chunk-1",
        indexedVectorId: "indexed-1",
        normalizedScore: 0.9,
        ranking: 1,
        content: "Security policy content",
        tokenCount: 8,
        documentId: "doc-1",
        sourceId: "source-1",
        sourceKey: "policy",
        sourceType: "policy",
        department: "legal",
        language: "en",
        metadata: { document_type: "policy" },
        selectionReason: "score",
        included: true,
      },
    ]);

    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]?.selectionRank, 1);
    assert.equal(chunks[0]?.references.documentId, "doc-1");
    assert.match(contextChecksum, /^[a-f0-9]{64}$/);
    assert.equal(totalTokens, 8);
  });
});
