import type { RuntimeKnowledgeChunkSnapshot } from "@workspace/retrieval-engine";
import { buildCitations, type KnowledgeCitation } from "@workspace/retrieval-engine";
import type { KnowledgeCitationDto } from "../dto/knowledge-context-dto.js";

export class KnowledgeCitationBuilder {
  build(chunks: RuntimeKnowledgeChunkSnapshot[]): KnowledgeCitationDto[] {
    return buildCitations(chunks).map(mapCitation);
  }

  formatContext(chunks: RuntimeKnowledgeChunkSnapshot[]): string {
    const citations = this.build(chunks);
    return citations
      .map(
        (cite) =>
          `[${cite.citationId}] ${cite.documentTitle}${cite.sectionTitle ? ` — ${cite.sectionTitle}` : ""}${cite.pageNumber ? ` p.${cite.pageNumber}` : ""}: ${cite.excerpt}`,
      )
      .join("\n\n");
  }
}

function mapCitation(citation: KnowledgeCitation): KnowledgeCitationDto {
  return {
    citationId: citation.citationId,
    chunkId: citation.chunkId,
    documentId: citation.documentId,
    documentTitle: citation.documentTitle,
    articleTitle: citation.documentTitle,
    sectionTitle: citation.sectionTitle,
    pageNumber: citation.pageNumber,
    excerpt: citation.excerpt,
    confidence: citation.confidence,
    score: citation.score,
    rank: citation.rank,
  };
}

export { mapCitation };
