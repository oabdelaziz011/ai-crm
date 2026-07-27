import type { RuntimeKnowledgeChunkSnapshot } from "../providers/knowledge-provider.js";
import { computeChunkConfidence } from "./confidence-scoring.js";

export type KnowledgeCitation = {
  citationId: string;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  sectionTitle: string | null;
  pageNumber: number | null;
  excerpt: string;
  confidence: number;
  score: number | null;
  rank: number;
};

export function buildCitations(chunks: RuntimeKnowledgeChunkSnapshot[]): KnowledgeCitation[] {
  return chunks.map((chunk, index) => {
    const documentId =
      typeof chunk.metadata.documentId === "string"
        ? chunk.metadata.documentId
        : typeof chunk.metadata.document_id === "string"
          ? chunk.metadata.document_id
          : "unknown";

    const sectionTitle =
      typeof chunk.metadata.sectionTitle === "string"
        ? chunk.metadata.sectionTitle
        : typeof chunk.metadata.section_heading === "string"
          ? chunk.metadata.section_heading
          : null;

    const pageNumber =
      typeof chunk.metadata.pageNumber === "number"
        ? chunk.metadata.pageNumber
        : typeof chunk.metadata.page_number === "number"
          ? chunk.metadata.page_number
          : null;

    const confidence = computeChunkConfidence(chunk);

    return {
      citationId: `cite-${index + 1}`,
      chunkId: chunk.id,
      documentId,
      documentTitle: chunk.documentTitle ?? "Document",
      sectionTitle,
      pageNumber,
      excerpt: chunk.content.slice(0, 280),
      confidence,
      score: chunk.score,
      rank: chunk.rank,
    };
  });
}

export function formatContextWithCitations(chunks: RuntimeKnowledgeChunkSnapshot[]): string {
  const citations = buildCitations(chunks);
  return citations
    .map((cite) => `[${cite.citationId}] ${cite.documentTitle}${cite.pageNumber ? ` p.${cite.pageNumber}` : ""}: ${cite.excerpt}`)
    .join("\n\n");
}
