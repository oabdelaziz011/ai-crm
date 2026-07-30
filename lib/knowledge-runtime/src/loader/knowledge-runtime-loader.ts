import type { KnowledgeRuntimeProvider } from "../provider/knowledge-runtime-provider.js";
import type { KnowledgeContextDto } from "../dto/knowledge-context-dto.js";
import type { KnowledgeAccessContext } from "../coordinator/knowledge-search-coordinator.js";

export type KnowledgeRuntimeLoaderInput = {
  companyId: string;
  question: string;
  collectionId: string;
  embeddingConnectionId: string;
  vectorStoreConnectionId: string;
  correlationId?: string;
  policyKey?: string;
  topK?: number;
  minimumScore?: number;
  searchMode?: "vector" | "keyword" | "hybrid";
  metadataFilters?: Record<string, unknown>;
};

export class KnowledgeRuntimeLoader {
  constructor(private readonly provider: KnowledgeRuntimeProvider) {}

  async load(
    ctx: KnowledgeAccessContext,
    input: KnowledgeRuntimeLoaderInput,
  ): Promise<KnowledgeContextDto | null> {
    const result = await this.provider.retrieve(ctx, {
      companyId: input.companyId,
      question: input.question,
      collectionId: input.collectionId,
      embeddingConnectionId: input.embeddingConnectionId,
      vectorStoreConnectionId: input.vectorStoreConnectionId,
      correlationId: input.correlationId,
      policyKey: input.policyKey,
      topK: input.topK,
      minimumScore: input.minimumScore,
      searchMode: input.searchMode ?? "hybrid",
      rerank: true,
      metadataFilters: input.metadataFilters,
    });

    return result.chunkCount > 0 ? result : null;
  }
}

export function createKnowledgeRuntimeLoader(provider: KnowledgeRuntimeProvider): KnowledgeRuntimeLoader {
  return new KnowledgeRuntimeLoader(provider);
}
