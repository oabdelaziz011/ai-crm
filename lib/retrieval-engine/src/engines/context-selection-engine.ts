import { SelectionError } from "../errors/error-catalog.js";
import type {
  KnowledgeHydrationReadRepository,
  VectorQueryReadRepository,
} from "../repositories/retrieval-repositories.js";
import type {
  ResolvedRetrievalPolicy,
  RetrievalCandidateChunk,
  SelectedRetrievalChunk,
  VectorQueryResultSnapshot,
} from "../types.js";
import { computePriorityScore, computeTextOverlap, estimateTokenCount } from "../utils/retrieval-utils.js";

export class ContextSelectionEngine {
  constructor(
    private readonly vectorQueryReader: VectorQueryReadRepository,
    private readonly hydrationReader: KnowledgeHydrationReadRepository,
  ) {}

  async buildCandidates(
    vectorQueryExecutionId: string,
    policy: ResolvedRetrievalPolicy,
    correlationId?: string,
  ): Promise<RetrievalCandidateChunk[]> {
    const results = await this.vectorQueryReader.listResults(vectorQueryExecutionId);
    const candidates: RetrievalCandidateChunk[] = [];

    for (const result of results) {
      const candidate = await this.hydrateCandidate(result, policy);
      if (candidate) candidates.push(candidate);

      if (policy.windowExpansion > 0 && candidate) {
        const adjacent = await this.hydrationReader.listAdjacentChunks(
          candidate.documentId,
          candidate.metadata.chunkOrder as number,
          policy.windowExpansion,
        );
        for (const chunk of adjacent) {
          if (chunk.id === candidate.knowledgeChunkId) continue;
          const expanded = await this.hydrateChunk(chunk, null, result.normalizedScore * 0.85, result.ranking);
          if (expanded) candidates.push(expanded);
        }
      }
    }

    if (results.length > 0 && candidates.length === 0) {
      throw new SelectionError("No retrieval candidates could be hydrated from vector query results.", correlationId);
    }

    return candidates;
  }

  selectChunks(
    candidates: RetrievalCandidateChunk[],
    policy: ResolvedRetrievalPolicy,
    correlationId?: string,
  ): { selected: SelectedRetrievalChunk[]; rejected: number } {
    if (candidates.length === 0) {
      return { selected: [], rejected: 0 };
    }

    const deduped = this.deduplicateCandidates(candidates);
    const overlapFiltered = this.removeOverlappingChunks(deduped, policy.overlapRemovalThreshold);
    const languageFiltered = policy.defaultLanguage
      ? overlapFiltered.filter((item) => item.language === policy.defaultLanguage)
      : overlapFiltered;

    const ranked = this.rankCandidates(languageFiltered, policy);
    const diversified = this.enforceSourceDiversity(ranked, policy);
    const selected = diversified.slice(0, policy.maxChunks).map((item) => ({
      ...item,
      selectionReason: this.describeSelectionReason(item, policy),
    }));

    if (selected.length === 0) {
      throw new SelectionError("No chunks remained after retrieval selection.", correlationId);
    }

    return {
      selected,
      rejected: candidates.length - selected.length,
    };
  }

  private async hydrateCandidate(
    result: VectorQueryResultSnapshot,
    policy: ResolvedRetrievalPolicy,
  ): Promise<RetrievalCandidateChunk | null> {
    const chunk = await this.hydrationReader.resolveChunkFromIndexedVector(result.indexedVectorId);
    if (!chunk) return null;
    return this.hydrateChunk(chunk, result.indexedVectorId, result.normalizedScore, result.ranking, result.metadata);
  }

  private async hydrateChunk(
    chunk: import("../types.js").KnowledgeChunkSnapshot,
    indexedVectorId: string | null,
    normalizedScore: number,
    ranking: number,
    resultMetadata: Record<string, unknown> = {},
  ): Promise<RetrievalCandidateChunk | null> {
    const document = await this.hydrationReader.resolveDocument(chunk.documentId);
    if (!document) return null;
    const source = await this.hydrationReader.resolveSource(document.sourceId);
    if (!source) return null;

    const department =
      (chunk.metadata.department as string | undefined) ??
      (document.metadata.department as string | undefined) ??
      null;

    return {
      knowledgeChunkId: chunk.id,
      indexedVectorId,
      normalizedScore,
      ranking,
      content: chunk.content,
      tokenCount: estimateTokenCount(chunk.content, chunk.tokenCount),
      documentId: document.id,
      sourceId: source.id,
      sourceKey: source.key,
      sourceType: source.sourceType,
      department,
      language: document.language,
      metadata: {
        ...resultMetadata,
        ...chunk.metadata,
        documentTitle: document.title,
        sourceKey: source.key,
        sourceType: source.sourceType,
        chunkOrder: chunk.chunkOrder,
      },
    };
  }

  private deduplicateCandidates(candidates: RetrievalCandidateChunk[]): RetrievalCandidateChunk[] {
    const seen = new Set<string>();
    const unique: RetrievalCandidateChunk[] = [];

    for (const candidate of [...candidates].sort((left, right) => {
      if (right.normalizedScore !== left.normalizedScore) {
        return right.normalizedScore - left.normalizedScore;
      }
      return left.knowledgeChunkId.localeCompare(right.knowledgeChunkId);
    })) {
      if (seen.has(candidate.knowledgeChunkId)) continue;
      seen.add(candidate.knowledgeChunkId);
      unique.push(candidate);
    }

    return unique;
  }

  private removeOverlappingChunks(
    candidates: RetrievalCandidateChunk[],
    threshold: number,
  ): RetrievalCandidateChunk[] {
    const kept: RetrievalCandidateChunk[] = [];

    for (const candidate of candidates) {
      const overlaps = kept.some(
        (existing) => computeTextOverlap(existing.content, candidate.content) >= threshold,
      );
      if (!overlaps) kept.push(candidate);
    }

    return kept;
  }

  private rankCandidates(
    candidates: RetrievalCandidateChunk[],
    policy: ResolvedRetrievalPolicy,
  ): RetrievalCandidateChunk[] {
    return [...candidates].sort((left, right) => {
      const leftPriority = computePriorityScore(
        left.sourceKey,
        left.department,
        policy.sourcePriority,
        policy.departmentPriority,
      );
      const rightPriority = computePriorityScore(
        right.sourceKey,
        right.department,
        policy.sourcePriority,
        policy.departmentPriority,
      );

      if (policy.chunkSelectionStrategy === "diversity_first") {
        if (left.sourceId !== right.sourceId) {
          return left.sourceId.localeCompare(right.sourceId);
        }
      } else if (policy.chunkSelectionStrategy === "balanced") {
        const leftCombined = left.normalizedScore + leftPriority * 0.1;
        const rightCombined = right.normalizedScore + rightPriority * 0.1;
        if (rightCombined !== leftCombined) return rightCombined - leftCombined;
      }

      if (rightPriority !== leftPriority) return rightPriority - leftPriority;
      if (right.normalizedScore !== left.normalizedScore) return right.normalizedScore - left.normalizedScore;
      if (left.ranking !== right.ranking) return left.ranking - right.ranking;
      return left.knowledgeChunkId.localeCompare(right.knowledgeChunkId);
    });
  }

  private enforceSourceDiversity(
    candidates: RetrievalCandidateChunk[],
    policy: ResolvedRetrievalPolicy,
  ): RetrievalCandidateChunk[] {
    if (policy.minSourceDiversity <= 1) return candidates;

    const uniqueSources = new Set(candidates.map((item) => item.sourceId));
    if (uniqueSources.size >= policy.minSourceDiversity) return candidates;

    const bySource = new Map<string, RetrievalCandidateChunk[]>();
    for (const candidate of candidates) {
      const bucket = bySource.get(candidate.sourceId) ?? [];
      bucket.push(candidate);
      bySource.set(candidate.sourceId, bucket);
    }

    const diversified: RetrievalCandidateChunk[] = [];
    const sourceIds = [...bySource.keys()].sort();
    let added = true;

    while (added && diversified.length < candidates.length) {
      added = false;
      for (const sourceId of sourceIds) {
        const bucket = bySource.get(sourceId) ?? [];
        const next = bucket.shift();
        if (next) {
          diversified.push(next);
          added = true;
        }
      }
    }

    return diversified;
  }

  private describeSelectionReason(
    chunk: RetrievalCandidateChunk,
    policy: ResolvedRetrievalPolicy,
  ): string {
    const priority = computePriorityScore(
      chunk.sourceKey,
      chunk.department,
      policy.sourcePriority,
      policy.departmentPriority,
    );
    return `score=${chunk.normalizedScore.toFixed(4)};priority=${priority};strategy=${policy.chunkSelectionStrategy}`;
  }
}
