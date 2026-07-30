export function createCorrelationId(existing?: string): string {
  return existing ?? crypto.randomUUID();
}

export function extractResponseContent(content: string | Record<string, unknown>): string {
  if (typeof content === "string") return content;
  if ("reply" in content && typeof content.reply === "string") return content.reply;
  if ("text" in content && typeof content.text === "string") return content.text;
  return JSON.stringify(content);
}

export function formatRetrievalInstructions(
  chunks: Array<{ content: string; metadata: Record<string, unknown> }>,
): string[] {
  return chunks.map((chunk, index) => {
    const title = (chunk.metadata.documentTitle as string | undefined) ?? `Chunk ${index + 1}`;
    return `[${title}] ${chunk.content}`;
  });
}

export function mapRetrievalSnapshotToKnowledgeContext(
  retrieval: {
    executionId: string;
    chunkCount: number;
    totalTokens: number;
    contextText?: string;
    confidence?: number;
    searchMode?: "vector" | "keyword" | "hybrid";
    citations?: Array<Record<string, unknown>>;
    chunks: Array<{ content: string; metadata: Record<string, unknown> }>;
  } | null,
) {
  if (!retrieval || retrieval.chunks.length === 0) return undefined;
  const chunks = retrieval.chunks.map((chunk, index) => ({
    id: String(chunk.metadata.knowledgeChunkId ?? chunk.metadata.chunkId ?? index),
    content: chunk.content,
    score: typeof chunk.metadata.score === "number" ? chunk.metadata.score : null,
    documentTitle:
      typeof chunk.metadata.documentTitle === "string" ? chunk.metadata.documentTitle : undefined,
    sectionTitle:
      typeof chunk.metadata.sectionTitle === "string" ? chunk.metadata.sectionTitle : undefined,
    confidence: typeof chunk.metadata.confidence === "number" ? chunk.metadata.confidence : undefined,
    citationId: typeof chunk.metadata.citationId === "string" ? chunk.metadata.citationId : undefined,
  }));
  return {
    contextText:
      retrieval.contextText?.trim() ||
      formatRetrievalInstructions(retrieval.chunks).join("\n\n"),
    chunkCount: retrieval.chunkCount,
    totalTokens: retrieval.totalTokens,
    executionId: retrieval.executionId,
    confidence: retrieval.confidence,
    searchMode: retrieval.searchMode,
    citations: retrieval.citations,
    chunks,
  };
}
