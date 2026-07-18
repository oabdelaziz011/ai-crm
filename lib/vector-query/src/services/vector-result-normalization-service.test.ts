import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeProviderScore } from "../utils/query-utils.js";
import { createTestEnvironment } from "./test-utils.js";

describe("VectorResultNormalizationService", () => {
  it("normalizes provider scores to 0-1 range", async () => {
    const env = createTestEnvironment();
    const normalized = await env.normalization.normalizeHits("collection-1", [
      { vectorId: "embedding-1", providerScore: 87.5, metadata: { document_type: "policy" } },
    ]);

    assert.equal(normalized.length, 1);
    assert.equal(normalized[0]?.normalizedScore, normalizeProviderScore(87.5));
    assert.ok(normalized[0]!.normalizedScore <= 1);
  });

  it("skips hits that cannot be resolved to indexed vectors", async () => {
    const env = createTestEnvironment();
    const normalized = await env.normalization.normalizeHits("collection-1", [
      { vectorId: "missing-embedding", providerScore: 0.9, metadata: {} },
    ]);

    assert.equal(normalized.length, 0);
  });
});
