import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RankingError } from "../errors.js";
import { createTestEnvironment } from "./test-utils.js";

describe("VectorRankingService", () => {
  it("ranks, deduplicates, and applies thresholds", () => {
    const env = createTestEnvironment();
    const ranked = env.ranking.rankResults(
      [
        {
          vectorId: "embedding-1",
          indexedVectorId: "indexed-1",
          normalizedScore: 0.9,
          providerScore: 90,
          metadata: {},
        },
        {
          vectorId: "embedding-1",
          indexedVectorId: "indexed-1",
          normalizedScore: 0.9,
          providerScore: 90,
          metadata: {},
        },
        {
          vectorId: "embedding-2",
          indexedVectorId: "indexed-2",
          normalizedScore: 0.05,
          providerScore: 5,
          metadata: {},
        },
      ],
      {
        policyId: "policy-1",
        defaultTopK: 2,
        minimumSimilarityScore: 0.1,
        maximumResults: 5,
        metadata: {},
      },
    );

    assert.equal(ranked.length, 1);
    assert.equal(ranked[0]?.ranking, 1);
  });

  it("removes invalid scores and preserves stable ordering", () => {
    const env = createTestEnvironment();
    const ranked = env.ranking.rankResults(
      [
        {
          vectorId: "embedding-1",
          indexedVectorId: "indexed-b",
          normalizedScore: 0.5,
          providerScore: 50,
          metadata: {},
        },
        {
          vectorId: "embedding-2",
          indexedVectorId: "indexed-a",
          normalizedScore: 0.5,
          providerScore: 50,
          metadata: {},
        },
        {
          vectorId: "embedding-3",
          indexedVectorId: "indexed-c",
          normalizedScore: Number.NaN,
          providerScore: 0,
          metadata: {},
        },
      ],
      {
        policyId: "policy-1",
        defaultTopK: 5,
        minimumSimilarityScore: 0,
        maximumResults: 5,
        metadata: {},
      },
    );

    assert.equal(ranked.length, 2);
    assert.equal(ranked[0]?.indexedVectorId, "indexed-a");
    assert.equal(ranked[1]?.indexedVectorId, "indexed-b");
  });

  it("throws when all candidate scores are invalid", () => {
    const env = createTestEnvironment();

    assert.throws(
      () =>
        env.ranking.rankResults(
          [
            {
              vectorId: "embedding-1",
              indexedVectorId: "indexed-1",
              normalizedScore: Number.NaN,
              providerScore: 0,
              metadata: {},
            },
          ],
          {
            policyId: "policy-1",
            defaultTopK: 5,
            minimumSimilarityScore: 0,
            maximumResults: 5,
            metadata: {},
          },
        ),
      RankingError,
    );
  });
});
