import type { AIStreamEvent } from "@workspace/ai-provider-layer";
import type { ServiceContext } from "../types.js";

export type RuntimeGatewayContext = {
  companyId: string;
  tenantId?: string;
  workflowId?: string;
  executionId?: string;
  conversationId?: string;
  userId?: string | null;
};

export type RuntimeGatewayChatRequest = {
  messages: Array<{
    role: "system" | "developer" | "user" | "assistant" | "tool";
    content: string;
    toolCallId?: string;
    toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  }>;
  providerKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  context: RuntimeGatewayContext;
  metadata?: Record<string, unknown>;
  tools?: unknown[];
};

export type RuntimeGatewayChatResponse = {
  text: string;
  model: string;
  providerKey: string;
  finishReason: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number; source?: "provider" };
  latencyMs: number;
  estimatedCostUsd?: number;
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
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
  gatewayMessages?: Array<{
    role: "system" | "developer" | "user" | "assistant";
    content: string;
  }>;
  messagePlan?: {
    mode: "conversation" | "execution";
    outputContract: { format: "text" | "json"; instructions?: string };
  };
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
  mode?: "conversation" | "execution";
  currentUserMessage?: string;
  toolsEnabled?: boolean;
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

export type RuntimeToolRouteInput = {
  conversationId: string;
  toolKey: string;
  input: Record<string, unknown>;
  triggeredBy?: "router" | "agent" | "automation" | "llm";
};

export type RuntimeToolRouteResult = {
  executionId: string;
  toolKey: string;
  status: string;
  output: Record<string, unknown> | null;
  durationMs: number;
  errorCode: string | null;
  errorMessage: string | null;
};

export interface RuntimeToolPort {
  route(ctx: ServiceContext, input: RuntimeToolRouteInput): Promise<RuntimeToolRouteResult>;
  listLlmTools(): unknown[];
  allowedToolKeys(): string[];
}

export type PlatformRuntimeConfigPort = {
  resolve(input: {
    companyId: string;
    providerKey: string;
    useCase?: string;
  }): Promise<Record<string, unknown>>;
};
