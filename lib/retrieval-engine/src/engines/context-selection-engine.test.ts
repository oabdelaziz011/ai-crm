import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestEnvironment } from "./test-utils.js";

describe("ContextSelectionEngine", () => {
  it("hydrates and selects ranked chunks", async () => {
    const env = createTestEnvironment();
    const policy = await env.policy.resolvePolicy(
      { userId: "u", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      "company-1",
    );

    const candidates = await env.selection.buildCandidates("vq-exec-1", policy);
    assert.equal(candidates.length, 2);

    const { selected, rejected } = env.selection.selectChunks(candidates, policy);
    assert.ok(selected.length > 0);
    assert.equal(selected[0]?.normalizedScore, 0.92);
    assert.ok(rejected >= 0);
  });

  it("deduplicates overlapping chunks", () => {
    const env = createTestEnvironment();
    const policy = {
      policyId: "policy-1",
      maxContextTokens: 500,
      maxChunks: 5,
      windowExpansion: 0,
      minSourceDiversity: 1,
      overlapRemovalThreshold: 0.5,
      defaultLanguage: null,
      sourcePriority: {},
      departmentPriority: {},
      chunkSelectionStrategy: "score_first" as const,
      metadata: {},
    };

    const { selected } = env.selection.selectChunks(
      [
        {
          knowledgeChunkId: "chunk-a",
          indexedVectorId: "indexed-a",
          normalizedScore: 0.9,
          ranking: 1,
          content: "Enterprise security policy requires MFA",
          tokenCount: 10,
          documentId: "doc-a",
          sourceId: "source-a",
          sourceKey: "policy",
          sourceType: "policy",
          department: "legal",
          language: "en",
          metadata: {},
        },
        {
          knowledgeChunkId: "chunk-b",
          indexedVectorId: "indexed-b",
          normalizedScore: 0.8,
          ranking: 2,
          content: "Enterprise security policy requires MFA for users",
          tokenCount: 10,
          documentId: "doc-a",
          sourceId: "source-a",
          sourceKey: "policy",
          sourceType: "policy",
          department: "legal",
          language: "en",
          metadata: {},
        },
      ],
      policy,
    );

    assert.equal(selected.length, 1);
  });
});
