import type { ResolvedSearchPolicy } from "../types.js";
import { clampScore } from "../utils/query-utils.js";
import { RankingError } from "../errors/error-catalog.js";
import type { NormalizedQueryHit, RankedQueryHit } from "../types.js";

export class VectorRankingService {
  rankResults(
    hits: NormalizedQueryHit[],
    policy: ResolvedSearchPolicy,
    correlationId?: string,
  ): RankedQueryHit[] {
    const seen = new Set<string>();
    const unique: NormalizedQueryHit[] = [];

    for (const hit of hits) {
      if (!this.isValidScore(hit.normalizedScore)) continue;
      if (seen.has(hit.indexedVectorId)) continue;
      seen.add(hit.indexedVectorId);
      unique.push({ ...hit, normalizedScore: clampScore(hit.normalizedScore) });
    }

    if (unique.length === 0 && hits.length > 0) {
      throw new RankingError("All candidate scores were invalid for ranking.", correlationId);
    }

    return unique
      .filter((item) => item.normalizedScore >= policy.minimumSimilarityScore)
      .sort((left, right) => {
        if (right.normalizedScore !== left.normalizedScore) {
          return right.normalizedScore - left.normalizedScore;
        }
        return left.indexedVectorId.localeCompare(right.indexedVectorId);
      })
      .slice(0, Math.min(policy.defaultTopK, policy.maximumResults))
      .map((item, index) => ({
        ...item,
        ranking: index + 1,
      }));
  }

  private isValidScore(score: number): boolean {
    return !Number.isNaN(score) && score >= 0 && score <= 1;
  }
}
