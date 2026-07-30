import type { RuntimeContextSource, RuntimeContextProvider } from "./context-providers.js";

export class KnowledgeContextProvider implements RuntimeContextProvider {
  readonly key = "knowledge";

  resolve(source: RuntimeContextSource) {
    const knowledge = (source.knowledge as Record<string, unknown> | undefined) ?? {};
    const chunks = Array.isArray(knowledge.chunks) ? knowledge.chunks : [];
    const citations = Array.isArray(knowledge.citations) ? knowledge.citations : [];
    return {
      knowledge: {
        context: typeof knowledge.contextText === "string" ? knowledge.contextText : "",
        chunks,
        citations,
        chunkCount: typeof knowledge.chunkCount === "number" ? knowledge.chunkCount : chunks.length,
        totalTokens: typeof knowledge.totalTokens === "number" ? knowledge.totalTokens : 0,
        executionId: knowledge.executionId ?? "",
        confidence: typeof knowledge.confidence === "number" ? knowledge.confidence : 0,
        searchMode: knowledge.searchMode ?? "hybrid",
      },
    };
  }
}
