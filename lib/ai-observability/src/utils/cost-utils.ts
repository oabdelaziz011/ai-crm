import { DEFAULT_CURRENCY, DEFAULT_MODEL_PRICING } from "../constants.js";
import type { TokenUsage } from "../types.js";

export type ModelPricing = {
  promptPer1kTokens: number;
  completionPer1kTokens: number;
  currency: string;
};

export function estimateTokenCost(
  tokenUsage: TokenUsage,
  pricing: ModelPricing = DEFAULT_MODEL_PRICING,
): { estimatedCost: number; currency: string } {
  const promptCost = (tokenUsage.prompt_tokens / 1000) * pricing.promptPer1kTokens;
  const completionCost = (tokenUsage.completion_tokens / 1000) * pricing.completionPer1kTokens;
  const estimatedCost = roundCost(promptCost + completionCost);
  return { estimatedCost, currency: pricing.currency ?? DEFAULT_CURRENCY };
}

export function roundCost(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function sumTokenUsage(records: TokenUsage[]): TokenUsage {
  return records.reduce(
    (acc, usage) => ({
      prompt_tokens: acc.prompt_tokens + usage.prompt_tokens,
      completion_tokens: acc.completion_tokens + usage.completion_tokens,
      total_tokens: acc.total_tokens + usage.total_tokens,
    }),
    { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  );
}
