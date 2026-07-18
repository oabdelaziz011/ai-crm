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
