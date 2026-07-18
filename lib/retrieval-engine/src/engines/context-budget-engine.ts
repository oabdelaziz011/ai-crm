import type { BudgetedRetrievalChunk, ResolvedRetrievalPolicy, SelectedRetrievalChunk } from "../types.js";

export class ContextBudgetEngine {
  enforceBudget(
    chunks: SelectedRetrievalChunk[],
    policy: ResolvedRetrievalPolicy,
  ): { included: BudgetedRetrievalChunk[]; discardedBudget: number } {
    const budgeted: BudgetedRetrievalChunk[] = [];
    let usedTokens = 0;
    let discardedBudget = 0;

    for (const chunk of chunks) {
      if (budgeted.filter((item) => item.included).length >= policy.maxChunks) {
        discardedBudget += 1;
        budgeted.push({
          ...chunk,
          included: false,
          discardReason: "max_chunks_exceeded",
        });
        continue;
      }

      if (usedTokens + chunk.tokenCount > policy.maxContextTokens) {
        discardedBudget += 1;
        budgeted.push({
          ...chunk,
          included: false,
          discardReason: "token_budget_exceeded",
        });
        continue;
      }

      usedTokens += chunk.tokenCount;
      budgeted.push({
        ...chunk,
        included: true,
      });
    }

    return {
      included: budgeted,
      discardedBudget,
    };
  }
}
