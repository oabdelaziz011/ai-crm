import type { ProviderQueryHit } from "../types.js";
import { normalizeProviderScore } from "../utils/query-utils.js";
import type { IndexedVectorReadRepository } from "../repositories/vector-query-repositories.js";
import type { NormalizedQueryHit } from "../types.js";

export class VectorResultNormalizationService {
  constructor(private readonly readRepository: IndexedVectorReadRepository) {}

  async normalizeHits(
    collectionId: string,
    hits: ProviderQueryHit[],
    _correlationId?: string,
  ): Promise<NormalizedQueryHit[]> {
    const normalized: NormalizedQueryHit[] = [];

    for (const hit of hits) {
      const indexed = await this.readRepository.resolveIndexedVector(collectionId, hit.vectorId);
      if (!indexed) continue;

      const providerScore = hit.providerScore;
      normalized.push({
        vectorId: hit.vectorId,
        indexedVectorId: indexed.id,
        normalizedScore: normalizeProviderScore(providerScore),
        providerScore,
        metadata: {
          ...(hit.metadata ?? {}),
          externalReference: indexed.external_reference,
          provider: indexed.provider,
        },
      });
    }

    return normalized;
  }
}
