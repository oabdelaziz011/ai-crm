import { AssemblyError } from "../errors/error-catalog.js";
import type { AssembledRetrievalChunk, BudgetedRetrievalChunk } from "../types.js";
import { computeContextChecksum } from "../utils/retrieval-utils.js";

export class ContextAssemblyEngine {
  assemble(chunks: BudgetedRetrievalChunk[], correlationId?: string): {
    chunks: AssembledRetrievalChunk[];
    contextChecksum: string;
    totalTokens: number;
  } {
    const included = chunks.filter((item) => item.included);
    if (included.length === 0) {
      throw new AssemblyError("No chunks remained after budget enforcement.", correlationId);
    }

    const assembled = included
      .sort((left, right) => {
        if (right.normalizedScore !== left.normalizedScore) {
          return right.normalizedScore - left.normalizedScore;
        }
        return left.knowledgeChunkId.localeCompare(right.knowledgeChunkId);
      })
      .map((chunk, index) => ({
        ...chunk,
        selectionRank: index + 1,
        metadata: this.normalizeMetadata(chunk.metadata),
        references: {
          documentId: chunk.documentId,
          sourceId: chunk.sourceId,
          knowledgeChunkId: chunk.knowledgeChunkId,
          indexedVectorId: chunk.indexedVectorId,
        },
      }));

    const totalTokens = assembled.reduce((sum, chunk) => sum + chunk.tokenCount, 0);

    return {
      chunks: assembled,
      contextChecksum: computeContextChecksum(
        assembled.map((chunk) => ({
          knowledgeChunkId: chunk.knowledgeChunkId,
          content: chunk.content,
        })),
      ),
      totalTokens,
    };
  }

  private normalizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (key.toLowerCase().includes("vector") || key.toLowerCase().includes("embedding")) continue;
      normalized[key] = value;
    }
    return normalized;
  }
}
