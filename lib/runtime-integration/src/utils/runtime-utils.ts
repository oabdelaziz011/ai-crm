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
    chunks: Array<{ content: string; metadata: Record<string, unknown> }>;
  } | null,
) {
  if (!retrieval || retrieval.chunks.length === 0) return undefined;
  const chunks = retrieval.chunks.map((chunk, index) => ({
    id: String(chunk.metadata.knowledgeChunkId ?? chunk.metadata.chunkId ?? index),
    content: chunk.content,
    score: typeof chunk.metadata.score === "number" ? chunk.metadata.score : null,
  }));
  return {
    contextText: formatRetrievalInstructions(retrieval.chunks).join("\n\n"),
    chunkCount: retrieval.chunkCount,
    totalTokens: retrieval.totalTokens,
    executionId: retrieval.executionId,
    chunks,
  };
}
