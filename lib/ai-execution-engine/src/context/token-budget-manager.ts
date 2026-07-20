import { TokenBudgetExceededError } from "../errors/runtime-errors.js";

export type TokenBudgetConfig = {
  maxTokens?: number;
  reservedOutputTokens?: number;
};

export type TokenBudgetResult = {
  allowedPromptTokens: number;
  promptTokens: number;
  outputTokensReserved: number;
  overflowTokens: number;
  withinBudget: boolean;
};

export class TokenBudgetManager {
  evaluate(promptTokens: number, config: TokenBudgetConfig = {}): TokenBudgetResult {
    const maxTokens = config.maxTokens ?? 8192;
    const reservedOutputTokens = config.reservedOutputTokens ?? 1024;
    const allowedPromptTokens = Math.max(0, maxTokens - reservedOutputTokens);
    const overflowTokens = Math.max(0, promptTokens - allowedPromptTokens);

    return {
      allowedPromptTokens,
      promptTokens,
      outputTokensReserved: reservedOutputTokens,
      overflowTokens,
      withinBudget: overflowTokens === 0,
    };
  }

  assertWithinBudget(promptTokens: number, config?: TokenBudgetConfig): TokenBudgetResult {
    const result = this.evaluate(promptTokens, config);
    if (!result.withinBudget) {
      throw new TokenBudgetExceededError(
        `Prompt exceeds token budget by ${result.overflowTokens} tokens (${result.promptTokens}/${result.allowedPromptTokens}).`,
      );
    }
    return result;
  }
}
