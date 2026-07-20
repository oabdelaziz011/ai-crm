import type { AIStreamEvent } from "@workspace/ai-provider-layer";

export type RuntimeGatewayContext = {
  companyId: string;
  tenantId?: string;
  workflowId?: string;
  executionId?: string;
  conversationId?: string;
  userId?: string | null;
};

export type RuntimeGatewayChatRequest = {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  providerKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  context: RuntimeGatewayContext;
  metadata?: Record<string, unknown>;
};

export type RuntimeGatewayChatResponse = {
  text: string;
  model: string;
  providerKey: string;
  finishReason: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  latencyMs: number;
  estimatedCostUsd?: number;
};

export interface RuntimeGatewayPort {
  chatCompletion(input: RuntimeGatewayChatRequest): Promise<RuntimeGatewayChatResponse>;
  streamChatCompletion?(input: RuntimeGatewayChatRequest): AsyncIterable<AIStreamEvent>;
}

export type RuntimeBuiltPrompt = {
  buildId: string | null;
  templateKey: string;
  templateVersionId: string;
  finalPrompt: string;
  metadata?: {
    renderedSize: number;
    variableCount: number;
    estimatedTokens: number;
    executionTimeMs: number;
  };
};

export type RuntimePromptExecuteInput = {
  companyId: string;
  conversationId?: string | null;
  templateKey?: string;
  templateType?: string;
  context: Record<string, unknown>;
  workflowId?: string;
  executionId?: string;
};

export interface RuntimePromptPort {
  execute(
    ctx: { userId: string | null; companyId: string | null; isSuperAdmin: boolean; hasPermission: (p: string) => boolean },
    input: RuntimePromptExecuteInput,
  ): Promise<{ builtPrompt: RuntimeBuiltPrompt }>;
}
