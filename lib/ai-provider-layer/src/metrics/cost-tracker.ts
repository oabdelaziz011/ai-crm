import type { TokenUsage } from "../models/request-response.js";

const MODEL_PRICING_USD_PER_1K: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-4o": { input: 0.0025, output: 0.01 },
  "claude-3-5-sonnet-latest": { input: 0.003, output: 0.015 },
  "gemini-1.5-flash": { input: 0.000075, output: 0.0003 },
  mock: { input: 0, output: 0 },
};

export type CostRecord = {
  providerKey: string;
  model: string;
  usage: TokenUsage;
  estimatedCostUsd: number;
  latencyMs: number;
  timestamp: string;
};

export class CostTracker {
  private readonly records: CostRecord[] = [];

  estimateCostUsd(providerKey: string, model: string, usage: TokenUsage): number {
    const pricing = MODEL_PRICING_USD_PER_1K[model] ?? MODEL_PRICING_USD_PER_1K[providerKey] ?? { input: 0, output: 0 };
    const inputCost = (usage.inputTokens / 1000) * pricing.input;
    const outputCost = (usage.outputTokens / 1000) * pricing.output;
    return Number((inputCost + outputCost).toFixed(6));
  }

  record(input: Omit<CostRecord, "timestamp" | "estimatedCostUsd"> & { estimatedCostUsd?: number }): CostRecord {
    const estimatedCostUsd =
      input.estimatedCostUsd ?? this.estimateCostUsd(input.providerKey, input.model, input.usage);
    const record: CostRecord = {
      ...input,
      estimatedCostUsd,
      timestamp: new Date().toISOString(),
    };
    this.records.unshift(record);
    return record;
  }

  list(limit = 100): CostRecord[] {
    return this.records.slice(0, limit);
  }
}
