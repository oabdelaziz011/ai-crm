import type { AIWorkflowServiceContext } from "./ai-workflow-execution-adapter.js";

export type AIWorkflowKnowledgeRetrievalInput = {
  companyId: string;
  question: string;
  embeddingConnectionId: string;
  vectorStoreConnectionId: string;
  collectionId: string;
  topK?: number;
  minimumScore?: number;
  maxTokenBudget?: number;
  metadataFilters?: Record<string, unknown>;
  correlationId?: string;
  policyKey?: string;
};

export type AIWorkflowKnowledgeChunk = {
  id: string;
  content: string;
  score: number | null;
  rank: number;
  tokenCount: number;
  documentTitle?: string | null;
  metadata?: Record<string, unknown>;
};

export type AIWorkflowKnowledgeRetrievalResult = {
  contextText: string;
  chunks: AIWorkflowKnowledgeChunk[];
  chunkCount: number;
  totalTokens: number;
  executionId: string;
  vectorQueryExecutionId: string;
  retrievalLatencyMs: number;
  rankingLatencyMs: number;
  policyId: string | null;
};

export interface AIWorkflowKnowledgeRetrievalPort {
  retrieve(
    ctx: AIWorkflowServiceContext,
    input: AIWorkflowKnowledgeRetrievalInput,
  ): Promise<AIWorkflowKnowledgeRetrievalResult>;
}
