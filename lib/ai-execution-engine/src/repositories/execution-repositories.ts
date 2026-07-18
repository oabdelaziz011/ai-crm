import type {
  AIExecutionMetricsRecord,
  AIExecutionRecord,
  CompleteAIExecutionInput,
  CreateAIExecutionInput,
  CreateAIExecutionMetricsInput,
  ListAIExecutionMetricsFilter,
  ListAIExecutionsFilter,
  PromptBuildSnapshot,
  ProviderConnectionSnapshot,
} from "../types.js";

export interface PromptBuildReader {
  findById(id: string): Promise<PromptBuildSnapshot | null>;
}

export interface ProviderConnectionReader {
  findById(id: string): Promise<ProviderConnectionSnapshot | null>;
  findDefault(companyId: string): Promise<ProviderConnectionSnapshot | null>;
}

export interface AIExecutionRepository {
  create(input: CreateAIExecutionInput): Promise<AIExecutionRecord>;
  markRunning(executionId: string): Promise<AIExecutionRecord>;
  complete(input: CompleteAIExecutionInput): Promise<AIExecutionRecord>;
  updateRetryCount(executionId: string, retryCount: number): Promise<AIExecutionRecord>;
  findById(id: string): Promise<AIExecutionRecord | null>;
  list(filter: ListAIExecutionsFilter): Promise<AIExecutionRecord[]>;
}

export interface AIExecutionMetricsRepository {
  create(input: CreateAIExecutionMetricsInput): Promise<AIExecutionMetricsRecord>;
  findByExecutionId(executionId: string): Promise<AIExecutionMetricsRecord | null>;
  list(filter: ListAIExecutionMetricsFilter): Promise<AIExecutionMetricsRecord[]>;
}
