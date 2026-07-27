export type ChatMessageRole = "system" | "developer" | "user" | "assistant" | "tool";

export type ChatToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type ChatMessage = {
  role: ChatMessageRole;
  content: string;
  toolCallId?: string;
  toolCalls?: ChatToolCall[];
};

export type ChatCompletionRequest = {
  messages: ChatMessage[];
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  metadata?: Record<string, unknown>;
  tools?: unknown[];
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type ChatCompletionResponse = {
  text: string;
  model: string;
  providerKey: string;
  finishReason: string;
  usage: TokenUsage;
  latencyMs: number;
  estimatedCostUsd?: number;
  providerMetadata?: Record<string, unknown>;
  toolCalls?: ChatToolCall[];
  assistantMessage?: ChatMessage;
};

export type TextGenerationRequest = {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  metadata?: Record<string, unknown>;
};

export type TextGenerationResponse = ChatCompletionResponse;

export type EmbeddingRequest = {
  input: string | string[];
  model?: string;
  metadata?: Record<string, unknown>;
};

export type EmbeddingResponse = {
  vectors: number[][];
  model: string;
  providerKey: string;
  dimensions: number;
  usage: TokenUsage;
  latencyMs: number;
  estimatedCostUsd?: number;
};

export type GatewayRequestContext = {
  companyId: string;
  tenantId?: string;
  workflowId?: string;
  executionId?: string;
  conversationId?: string;
  userId?: string | null;
};

export type GatewayChatRequest = ChatCompletionRequest & {
  providerKey?: string;
  context: GatewayRequestContext;
};

export type GatewayEmbeddingRequest = EmbeddingRequest & {
  providerKey?: string;
  context: GatewayRequestContext;
};
