import type { AIExecutionStatus, ResponseFormat } from "./constants.js";

export type TokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export type ExecutionRuntimePolicy = {
  temperature: number;
  top_p: number;
  presence_penalty: number;
  frequency_penalty: number;
  max_tokens: number;
  response_format: ResponseFormat;
  streaming: boolean;
  timeout_ms: number;
  retry_count: number;
  retry_delay_ms: number;
  fallback_connection_id: string | null;
};

export type ExecutionPolicyOverrides = Partial<ExecutionRuntimePolicy>;

export type ProviderConnectionSnapshot = {
  id: string;
  company_id: string;
  provider_key: string;
  configuration: Record<string, unknown>;
  is_default: boolean;
  is_enabled: boolean;
  uses_platform_key?: boolean;
};

export type PromptBuildSnapshot = {
  id: string;
  company_id: string;
  conversation_id: string | null;
  final_prompt: string;
  output_contract: {
    format: ResponseFormat;
    instructions: string;
    schema?: Record<string, unknown>;
  };
  gateway_messages: Array<{
    role: "system" | "developer" | "user" | "assistant";
    content: string;
  }>;
  message_plan: {
    mode: "conversation" | "execution";
    outputContract: { format: ResponseFormat; instructions?: string };
  } | null;
};

export type AIExecutionRecord = {
  id: string;
  company_id: string;
  conversation_id: string | null;
  prompt_build_id: string | null;
  provider_connection_id: string | null;
  fallback_connection_id: string | null;
  provider_key: string;
  model: string;
  status: AIExecutionStatus;
  runtime_policy: ExecutionRuntimePolicy;
  finish_reason: string | null;
  raw_response: Record<string, unknown> | null;
  normalized_response: Record<string, unknown> | null;
  token_usage: TokenUsage;
  error_code: string | null;
  error_message: string | null;
  retry_count: number;
  used_fallback_provider: boolean;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  created_by: string | null;
};

export type AIExecutionMetricsRecord = {
  id: string;
  company_id: string;
  execution_id: string;
  provider_key: string;
  model: string;
  status: AIExecutionStatus;
  latency_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  retry_count: number;
  used_fallback_provider: boolean;
  recorded_at: string;
};

export type NormalizedAIResponse = {
  content: string | Record<string, unknown>;
  format: ResponseFormat;
  model: string;
  provider_key: string;
  finish_reason: string;
};

export type AIExecutionResult = {
  execution_id: string;
  provider_key: string;
  model: string;
  status: AIExecutionStatus;
  latency_ms: number;
  token_usage: TokenUsage;
  finish_reason: string | null;
  raw_response: Record<string, unknown> | null;
  normalized_response: NormalizedAIResponse | null;
  error_code: string | null;
  error_message: string | null;
  used_fallback_provider: boolean;
  retry_count: number;
};

export type ExecuteAIInput = {
  companyId: string;
  promptBuildId: string;
  conversationId?: string | null;
  providerConnectionId?: string | null;
  model?: string | null;
  policy?: ExecutionPolicyOverrides;
  abortSignal?: AbortSignal | null;
  onStreamChunk?: (chunk: string) => void;
};

export type ListAIExecutionsFilter = {
  companyId: string;
  conversationId?: string;
  status?: AIExecutionStatus;
  providerKey?: string;
  limit?: number;
};

export type ListAIExecutionMetricsFilter = {
  companyId: string;
  providerKey?: string;
  limit?: number;
};

export type ServiceContext = {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  hasPermission: (permissionCode: string) => boolean;
};

export type CreateAIExecutionInput = {
  companyId: string;
  conversationId?: string | null;
  promptBuildId: string;
  providerConnectionId: string | null;
  fallbackConnectionId?: string | null;
  providerKey: string;
  model: string;
  runtimePolicy: ExecutionRuntimePolicy;
  createdBy?: string | null;
};

export type CompleteAIExecutionInput = {
  executionId: string;
  status: AIExecutionStatus;
  finishReason?: string | null;
  rawResponse?: Record<string, unknown> | null;
  normalizedResponse?: Record<string, unknown> | null;
  tokenUsage: TokenUsage;
  errorCode?: string | null;
  errorMessage?: string | null;
  retryCount: number;
  usedFallbackProvider: boolean;
  durationMs: number;
  fallbackConnectionId?: string | null;
  providerKey?: string;
  model?: string;
};

export type CreateAIExecutionMetricsInput = {
  companyId: string;
  executionId: string;
  providerKey: string;
  model: string;
  status: AIExecutionStatus;
  latencyMs: number;
  tokenUsage: TokenUsage;
  retryCount: number;
  usedFallbackProvider: boolean;
};

export type EnterpriseRuntimeMessage = {
  role: "customer" | "assistant" | "system";
  content: string;
  createdAt?: string;
};

export type EnterpriseRuntimeContextPolicyOverrides = {
  includeCustomer?: boolean;
  includeBooking?: boolean;
  includeConversation?: boolean;
  includeWorkflowVariables?: boolean;
  includeCompany?: boolean;
  includeKnowledge?: boolean;
  includeMetadata?: boolean;
};

export type EnterpriseRuntimeConversationWindowConfig = {
  maxMessages?: number;
  tokenBudget?: number;
};

export type EnterpriseRuntimeTokenBudgetConfig = {
  maxTokens?: number;
  reservedOutputTokens?: number;
};

export type EnterpriseRuntimeExecuteInput = {
  companyId: string;
  conversationId?: string | null;
  workflowId?: string | null;
  executionId?: string | null;
  sessionId?: string | null;
  correlationId?: string | null;
  promptBuildId?: string | null;
  templateKey?: string;
  templateType?: string;
  orchestrationMode?: "conversation" | "execution";
  currentUserMessage?: string;
  toolsEnabled?: boolean;
  providerConnectionId?: string | null;
  providerKey?: string;
  model?: string | null;
  policy?: ExecutionPolicyOverrides;
  contextPolicyKey?: string;
  contextPolicyOverrides?: EnterpriseRuntimeContextPolicyOverrides;
  conversationWindow?: EnterpriseRuntimeConversationWindowConfig;
  tokenBudget?: EnterpriseRuntimeTokenBudgetConfig;
  promptContext: Record<string, unknown>;
  knowledgeQuery?: import("./ports/knowledge-port.js").RuntimeKnowledgeQueryInput;
  recentMessages?: EnterpriseRuntimeMessage[];
  stream?: boolean;
  cacheEnabled?: boolean;
  abortSignal?: AbortSignal | null;
  onStreamChunk?: (chunk: string) => void;
};

export type EnterpriseRuntimeExecuteResult = {
  executionId: string;
  sessionId: string;
  promptBuildId: string | null;
  promptVersionId: string;
  templateKey: string;
  providerKey: string;
  model: string;
  status: AIExecutionStatus;
  latencyMs: number;
  contextSizeBytes: number;
  promptSizeBytes: number;
  gatewayLatencyMs: number;
  tokenUsage: TokenUsage;
  estimatedCostUsd: number | null;
  responseText: string;
  cacheHit: boolean;
  trimmedMessageCount: number;
};
