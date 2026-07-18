import type {
  RuntimeExecutionStatus,
  RuntimePipelineStage,
  RuntimeSessionStatus,
  RuntimeStepStatus,
} from "./constants.js";

export type ServiceContext = {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  hasPermission: (permissionCode: string) => boolean;
};

export type ExecutionPolicyRecord = {
  id: string;
  company_id: string;
  policy_name: string;
  knowledge_retrieval_enabled: boolean;
  max_pipeline_duration_ms: number;
  metadata: Record<string, unknown>;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type RuntimeSessionRecord = {
  id: string;
  company_id: string;
  conversation_id: string;
  session_status: RuntimeSessionStatus;
  correlation_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type RuntimeExecutionRecord = {
  id: string;
  company_id: string;
  session_id: string;
  conversation_id: string;
  policy_id: string | null;
  execution_status: RuntimeExecutionStatus;
  intent_key: string | null;
  provider_key: string | null;
  prompt_build_id: string | null;
  ai_execution_id: string | null;
  retrieval_execution_id: string | null;
  vector_query_execution_id: string | null;
  execution_time_ms: number | null;
  correlation_id: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type RuntimeStepRecord = {
  id: string;
  execution_id: string;
  stage: RuntimePipelineStage;
  step_status: RuntimeStepStatus;
  duration_ms: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type RuntimeErrorRecord = {
  id: string;
  execution_id: string;
  step_id: string | null;
  error_code: string;
  error_category: string;
  human_message: string;
  developer_message: string;
  correlation_id: string | null;
  recoverable: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type CreateExecutionPolicyInput = {
  companyId: string;
  policyName: string;
  knowledgeRetrievalEnabled?: boolean;
  maxPipelineDurationMs?: number;
  metadata?: Record<string, unknown>;
  isDefault?: boolean;
};

export type UpdateExecutionPolicyInput = {
  policyId: string;
  policyName?: string;
  knowledgeRetrievalEnabled?: boolean;
  maxPipelineDurationMs?: number;
  metadata?: Record<string, unknown>;
  isDefault?: boolean;
};

export type CreateRuntimeSessionInput = {
  companyId: string;
  conversationId: string;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
};

export type CreateRuntimeExecutionInput = {
  companyId: string;
  sessionId: string;
  conversationId: string;
  policyId?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
};

export type CreateRuntimeStepInput = {
  executionId: string;
  stage: RuntimePipelineStage;
  metadata?: Record<string, unknown>;
};

export type CreateRuntimeErrorInput = {
  executionId: string;
  stepId?: string | null;
  errorCode: string;
  errorCategory: string;
  humanMessage: string;
  developerMessage: string;
  correlationId?: string | null;
  recoverable?: boolean;
  metadata?: Record<string, unknown>;
};

export type ResolvedRuntimePolicy = {
  policyId: string | null;
  knowledgeRetrievalEnabled: boolean;
  maxPipelineDurationMs: number;
  metadata: Record<string, unknown>;
};

export type ConversationSnapshot = {
  id: string;
  companyId: string;
  state: string;
  metadata: Record<string, unknown>;
};

export type MessageSnapshot = {
  id: string;
  role: "customer" | "assistant" | "system";
  content: string;
  createdAt: string;
};

export type IntentSnapshot = {
  intentKey: string;
  confidence: number;
  matchedTool: string | null;
  reason: string;
  requiresHuman: boolean;
  requiresLlm: boolean;
  status: string;
};

export type RetrievalSnapshot = {
  executionId: string;
  contextId: string;
  chunkCount: number;
  totalTokens: number;
  chunks: Array<{ content: string; metadata: Record<string, unknown> }>;
};

export type PromptSnapshot = {
  buildId: string;
  templateKey: string;
  finalPrompt: string;
};

export type ExecutionSnapshot = {
  executionId: string;
  providerKey: string;
  model: string;
  status: string;
  latencyMs: number;
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
  responseContent: string;
};

export type ProviderSnapshot = {
  providerKey: string;
  connectionId: string | null;
};

export type RuntimeTelemetryEvent = {
  runtimeId: string;
  executionId: string;
  companyId: string;
  conversationId: string;
  correlationId: string;
  intentKey: string | null;
  providerKey: string | null;
  model?: string | null;
  aiExecutionId?: string | null;
  promptBuildId?: string | null;
  pipelineStage: RuntimePipelineStage | "completed" | "failed";
  executionTimeMs: number;
  latencyMs?: number;
  tokenUsageTotal: number;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  retryCount?: number;
  usedFallback?: boolean;
  error?: string | null;
};
