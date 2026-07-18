import type { AssembledRetrievalChunk, ResolvedRetrievalPolicy, RetrievalMetricsSnapshot } from "../types.js";

export class RetrievalMetricsEngine {
  computeMetrics(input: {
    startedAt: number;
    policy: ResolvedRetrievalPolicy;
    selectedCount: number;
    rejectedCount: number;
    discardedBudget: number;
    assembledChunks: AssembledRetrievalChunk[];
  }): RetrievalMetricsSnapshot {
    const budgetUsedTokens = input.assembledChunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0);

    return {
      durationMs: Date.now() - input.startedAt,
      chunksSelected: input.selectedCount,
      chunksRejected: input.rejectedCount,
      chunksDiscardedBudget: input.discardedBudget,
      budgetTokens: input.policy.maxContextTokens,
      budgetUsedTokens,
      policyId: input.policy.policyId,
    };
  }
}
