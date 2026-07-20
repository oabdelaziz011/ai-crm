import type { GatewayRequestContext } from "../models/request-response.js";

export type UsageOperation = "chat_completion" | "text_generation" | "embeddings" | "stream_chat";

export type UsageRecord = {
  id: string;
  operation: UsageOperation;
  providerKey: string;
  model: string;
  context: GatewayRequestContext;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  timestamp: string;
};

export class UsageTracker {
  private readonly records: UsageRecord[] = [];

  record(input: Omit<UsageRecord, "id" | "timestamp">): UsageRecord {
    const record: UsageRecord = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...input,
    };
    this.records.unshift(record);
    return record;
  }

  listByCompany(companyId: string): UsageRecord[] {
    return this.records.filter((record) => record.context.companyId === companyId);
  }

  listByWorkflow(workflowId: string): UsageRecord[] {
    return this.records.filter((record) => record.context.workflowId === workflowId);
  }

  list(limit = 200): UsageRecord[] {
    return this.records.slice(0, limit);
  }
}
