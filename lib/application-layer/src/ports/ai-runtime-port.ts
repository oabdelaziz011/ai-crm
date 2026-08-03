/** Public AI runtime request — consumed only through AIApplicationService.execute(). */
export type UnifiedRuntimeExecuteRequest = Readonly<{
  companyId: string;
  conversationId: string;
  messageText: string;
  pageContext?: Record<string, unknown>;
  correlationId?: string;
  policyId?: string;
  providerConnectionId?: string | null;
  knowledgeRetrieval?: {
    collectionId: string;
    embeddingConnectionId?: string;
    vectorStoreConnectionId?: string;
    connectionId?: string;
    queryVector?: number[];
    embeddingId?: string;
  };
  executionPolicy?: {
    streaming?: boolean;
  };
  onStreamChunk?: (chunk: string) => void;
  abortSignal?: AbortSignal | null;
  /** Entity hints for unified context assembly */
  contextHints?: Readonly<{
    customerId?: string;
    leadId?: string;
    bookingId?: string;
    invoiceId?: string;
    knowledgeQuery?: string;
  }>;
}>;

export type UnifiedRuntimeExecuteResponse = Readonly<{
  runtimeId: string;
  executionId: string;
  correlationId: string | null;
  executionTimeMs: number;
  intentKey: string | null;
  providerKey: string | null;
  responseContent: string;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  contextCacheHit?: boolean;
}>;

export type UnifiedRuntimeServiceContext = Readonly<{
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  hasPermission: (permission: string) => boolean;
}>;

/** Port wrapping EnterpriseRuntimeCoordinator — injected by login-app, never imported directly. */
export type EnterpriseRuntimeCoordinatorPort = Readonly<{
  execute(
    ctx: UnifiedRuntimeServiceContext,
    input: UnifiedRuntimeExecuteRequest,
  ): Promise<UnifiedRuntimeExecuteResponse & { steps?: unknown[] }>;
}>;

/** Internal enterprise runtime for workflow nodes — kept behind unified entry. */
export type EnterpriseRuntimeInternalPort = Readonly<{
  buildPrompt(ctx: UnifiedRuntimeServiceContext, input: Record<string, unknown>): Promise<{
    buildId: string | null;
    templateKey: string;
    templateVersionId: string;
    finalPrompt: string;
    contextSizeBytes?: number;
  }>;
  execute(ctx: UnifiedRuntimeServiceContext, input: Record<string, unknown>): Promise<{
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
    tokenUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    estimatedCostUsd: number | null;
    cacheHit: boolean;
  }>;
}>;
