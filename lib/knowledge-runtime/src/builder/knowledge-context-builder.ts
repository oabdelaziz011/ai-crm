import type {
  KnowledgeQueryResult,
  RuntimeKnowledgeChunkSnapshot,
} from "@workspace/retrieval-engine";
import { computeRetrievalConfidence } from "@workspace/retrieval-engine";
import { KnowledgeCitationBuilder } from "../citation/knowledge-citation-builder.js";
import type { KnowledgeChunkDto, KnowledgeContextDto } from "../dto/knowledge-context-dto.js";
import { KnowledgeChunkRanker } from "../ranking/knowledge-chunk-ranker.js";

export class KnowledgeContextBuilder {
  private readonly citationBuilder = new KnowledgeCitationBuilder();
  private readonly ranker = new KnowledgeChunkRanker();

  build(
    result: KnowledgeQueryResult,
    options?: {
      query?: string;
      rerank?: boolean;
      minimumScore?: number;
    },
  ): KnowledgeContextDto {
    const rankedChunks = this.ranker.rank({
      chunks: result.chunks,
      query: options?.query ?? "",
      searchMode: result.searchMode,
      rerank: options?.rerank ?? false,
      maxChunks: result.chunkCount,
      minimumScore: options?.minimumScore,
    });

    const citations = this.citationBuilder.build(rankedChunks);
    const chunks = mapChunks(rankedChunks, citations);
    const contextText = this.citationBuilder.formatContext(rankedChunks);

    return {
      contextText: contextText || result.contextText,
      chunks,
      citations,
      chunkCount: chunks.length,
      totalTokens: chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0),
      confidence: computeRetrievalConfidence(rankedChunks),
      executionId: result.executionId,
      vectorQueryExecutionId: result.vectorQueryExecutionId,
      searchMode: result.searchMode,
      retrievalLatencyMs: result.retrievalLatencyMs,
      rankingLatencyMs: result.rankingLatencyMs,
      policyId: result.policyId,
      cacheHit: false,
    };
  }

  toRetrievalSnapshot(context: KnowledgeContextDto, contextId?: string) {
    return {
      executionId: context.executionId,
      contextId: contextId ?? context.executionId,
      chunkCount: context.chunkCount,
      totalTokens: context.totalTokens,
      confidence: context.confidence,
      searchMode: context.searchMode,
      vectorQueryExecutionId: context.vectorQueryExecutionId,
      retrievalLatencyMs: context.retrievalLatencyMs,
      rankingLatencyMs: context.rankingLatencyMs,
      policyId: context.policyId,
      contextText: context.contextText,
      citations: context.citations,
      chunks: context.chunks.map((chunk) => ({
        content: chunk.chunkText,
        metadata: {
          knowledgeChunkId: chunk.id,
          chunkId: chunk.id,
          documentTitle: chunk.documentTitle,
          articleTitle: chunk.articleTitle,
          sectionTitle: chunk.sectionTitle,
          sourceId: chunk.sourceId,
          score: chunk.score,
          confidence: chunk.confidence,
          rank: chunk.rank,
          citationId: chunk.citation.citationId,
        },
      })),
    };
  }
}

function mapChunks(
  chunks: RuntimeKnowledgeChunkSnapshot[],
  citations: ReturnType<KnowledgeCitationBuilder["build"]>,
): KnowledgeChunkDto[] {
  return chunks.map((chunk, index) => {
    const citation = citations[index] ?? citations.find((item) => item.chunkId === chunk.id);
    const sourceId =
      typeof chunk.metadata.sourceId === "string"
        ? chunk.metadata.sourceId
        : typeof chunk.metadata.documentId === "string"
          ? chunk.metadata.documentId
          : "unknown";

    const articleTitle =
      typeof chunk.metadata.articleTitle === "string"
        ? chunk.metadata.articleTitle
        : chunk.documentTitle ?? null;

    return {
      id: chunk.id,
      chunkText: chunk.content,
      articleTitle,
      documentTitle: chunk.documentTitle ?? citation?.documentTitle ?? "Document",
      sectionTitle: citation?.sectionTitle ?? null,
      sourceId,
      confidence: citation?.confidence ?? 0,
      score: chunk.score,
      rank: chunk.rank,
      tokenCount: chunk.tokenCount,
      citation: citation ?? {
        citationId: `cite-${index + 1}`,
        chunkId: chunk.id,
        documentId: sourceId,
        documentTitle: chunk.documentTitle ?? "Document",
        articleTitle,
        sectionTitle: null,
        pageNumber: null,
        excerpt: chunk.content.slice(0, 280),
        confidence: 0,
        score: chunk.score,
        rank: chunk.rank,
      },
    };
  });
}
