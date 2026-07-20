import type { AIWorkflowKnowledgeRetrievalPort } from "@workspace/ai-workflow-platform";
import type { KnowledgeProvider } from "@workspace/retrieval-engine";

export function createAIWorkflowKnowledgePortAdapter(
  knowledge: KnowledgeProvider,
): AIWorkflowKnowledgeRetrievalPort {
  return {
    async retrieve(ctx, input) {
      const result = await knowledge.retrieve(ctx as never, input);
      return {
        contextText: result.contextText,
        chunks: result.chunks.map((chunk) => ({
          id: chunk.id,
          content: chunk.content,
          score: chunk.score,
          rank: chunk.rank,
          tokenCount: chunk.tokenCount,
          documentTitle: chunk.documentTitle ?? null,
          metadata: chunk.metadata,
        })),
        chunkCount: result.chunkCount,
        totalTokens: result.totalTokens,
        executionId: result.executionId,
        vectorQueryExecutionId: result.vectorQueryExecutionId,
        retrievalLatencyMs: result.retrievalLatencyMs,
        rankingLatencyMs: result.rankingLatencyMs,
        policyId: result.policyId,
      };
    },
  };
}
