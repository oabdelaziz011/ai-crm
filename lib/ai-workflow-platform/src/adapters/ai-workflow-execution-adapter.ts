export type AIWorkflowServiceContext = {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  hasPermission: (permission: string) => boolean;
};

export type AIWorkflowExecutionRequest = {
  companyId: string;
  workflowId: string;
  executionId: string;
  conversationId?: string | null;
  correlationId?: string | null;
  templateKey: string;
  templateType?: string;
  providerConnectionId?: string | null;
  providerKey?: string | null;
  model?: string | null;
  workflowVariables?: Record<string, unknown>;
  workflowInput?: Record<string, unknown>;
  knowledgeQuery?: {
    question: string;
    collectionId?: string | null;
    embeddingConnectionId?: string | null;
    vectorStoreConnectionId?: string | null;
    maxChunks?: number;
    similarityThreshold?: number;
  };
  policy?: {
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    streaming?: boolean;
    timeoutMs?: number;
    retryCount?: number;
    responseFormat?: "text" | "json";
  };
  contextPolicyOverrides?: {
    includeWorkflowVariables?: boolean;
    includeKnowledge?: boolean;
  };
  stream?: boolean;
  onStreamChunk?: (chunk: string) => void;
  abortSignal?: AbortSignal | null;
};

export type AIWorkflowPromptResult = {
  buildId: string | null;
  templateKey: string;
  templateVersionId: string;
  finalPrompt: string;
  contextSizeBytes: number;
};

export type AIWorkflowRuntimeExecutionResult = {
  executionId: string;
  promptBuildId: string | null;
  promptVersionId: string;
  templateKey: string;
  providerKey: string;
  model: string;
  responseText: string;
  latencyMs: number;
  gatewayLatencyMs: number;
  contextSizeBytes: number;
  tokenUsage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  estimatedCostUsd: number | null;
  cacheHit: boolean;
  knowledgeChunkCount?: number;
};

export interface AIWorkflowExecutionPort {
  buildPrompt(
    ctx: AIWorkflowServiceContext,
    input: AIWorkflowExecutionRequest,
  ): Promise<AIWorkflowPromptResult>;
  execute(
    ctx: AIWorkflowServiceContext,
    input: AIWorkflowExecutionRequest,
  ): Promise<AIWorkflowRuntimeExecutionResult>;
}

export type EnterpriseRuntimeLike = {
  buildPrompt(
    ctx: AIWorkflowServiceContext,
    input: Record<string, unknown>,
  ): Promise<{
    buildId: string | null;
    templateKey: string;
    templateVersionId: string;
    finalPrompt: string;
    contextSizeBytes?: number;
  }>;
  execute(
    ctx: AIWorkflowServiceContext,
    input: Record<string, unknown>,
  ): Promise<{
    executionId: string;
    promptBuildId: string | null;
    promptVersionId: string;
    templateKey: string;
    providerKey: string;
    model: string;
    responseText: string;
    latencyMs: number;
    gatewayLatencyMs: number;
    contextSizeBytes: number;
    tokenUsage: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
    estimatedCostUsd: number | null;
    cacheHit: boolean;
  }>;
};

function toEnterpriseInput(request: AIWorkflowExecutionRequest): Record<string, unknown> {
  return {
    companyId: request.companyId,
    workflowId: request.workflowId,
    executionId: request.executionId,
    conversationId: request.conversationId ?? null,
    correlationId: request.correlationId ?? request.executionId,
    templateKey: request.templateKey,
    templateType: request.templateType ?? "workflow",
    providerConnectionId: request.providerConnectionId ?? null,
    providerKey: request.providerKey ?? undefined,
    model: request.model ?? null,
    policy: request.policy,
    contextPolicyOverrides: request.contextPolicyOverrides,
    promptContext: {
      companyId: request.companyId,
      workflowId: request.workflowId,
      executionId: request.executionId,
      workflowVariables: request.workflowVariables ?? {},
      workflowInput: request.workflowInput ?? {},
    },
    knowledgeQuery: request.knowledgeQuery,
    stream: request.stream,
    onStreamChunk: request.onStreamChunk,
    abortSignal: request.abortSignal,
  };
}

export class AIWorkflowExecutionAdapter implements AIWorkflowExecutionPort {
  constructor(private readonly runtime: EnterpriseRuntimeLike) {}

  async buildPrompt(
    ctx: AIWorkflowServiceContext,
    input: AIWorkflowExecutionRequest,
  ): Promise<AIWorkflowPromptResult> {
    const built = await this.runtime.buildPrompt(ctx, toEnterpriseInput(input));
    return {
      buildId: built.buildId,
      templateKey: built.templateKey,
      templateVersionId: built.templateVersionId,
      finalPrompt: built.finalPrompt,
      contextSizeBytes: built.contextSizeBytes ?? 0,
    };
  }

  async execute(
    ctx: AIWorkflowServiceContext,
    input: AIWorkflowExecutionRequest,
  ): Promise<AIWorkflowRuntimeExecutionResult> {
    const result = await this.runtime.execute(ctx, toEnterpriseInput(input));
    return {
      executionId: result.executionId,
      promptBuildId: result.promptBuildId,
      promptVersionId: result.promptVersionId,
      templateKey: result.templateKey,
      providerKey: result.providerKey,
      model: result.model,
      responseText: result.responseText,
      latencyMs: result.latencyMs,
      gatewayLatencyMs: result.gatewayLatencyMs,
      contextSizeBytes: result.contextSizeBytes,
      tokenUsage: result.tokenUsage,
      estimatedCostUsd: result.estimatedCostUsd,
      cacheHit: result.cacheHit,
    };
  }
}

export function createAIWorkflowExecutionAdapter(
  runtime: EnterpriseRuntimeLike,
): AIWorkflowExecutionAdapter {
  return new AIWorkflowExecutionAdapter(runtime);
}
