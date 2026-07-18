import type { RuntimePipelineStage } from "../constants.js";

/** Public request DTO — never expose database entities. */
export type RuntimeExecutionRequest = {
  companyId: string;
  conversationId: string;
  messageText: string;
  correlationId?: string;
  policyId?: string;
  providerConnectionId?: string | null;
  knowledgeRetrieval?: {
    collectionId: string;
    embeddingConnectionId?: string;
    vectorStoreConnectionId?: string;
    /** @deprecated Use vectorStoreConnectionId */
    connectionId?: string;
    /** @deprecated Question-based retrieval preferred — use messageText */
    queryVector?: number[];
    /** @deprecated Question-based retrieval preferred */
    embeddingId?: string;
  };
  executionPolicy?: {
    streaming?: boolean;
  };
  onStreamChunk?: (chunk: string) => void;
  abortSignal?: AbortSignal | null;
};

/** Public step DTO. */
export type RuntimeStep = {
  stage: RuntimePipelineStage;
  status: "running" | "completed" | "failed" | "skipped";
  durationMs: number | null;
  metadata: Record<string, unknown>;
};

/** Public session DTO. */
export type RuntimeSession = {
  sessionId: string;
  conversationId: string;
  correlationId: string | null;
  status: string;
};

/** Public response DTO — never expose database entities. */
export type RuntimeExecutionResponse = {
  runtimeId: string;
  executionId: string;
  session: RuntimeSession;
  correlationId: string | null;
  executionTimeMs: number;
  intentKey: string | null;
  providerKey: string | null;
  responseContent: string;
  steps: RuntimeStep[];
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

export function toRuntimeStep(input: {
  stage: RuntimePipelineStage;
  status: RuntimeStep["status"];
  durationMs: number | null;
  metadata?: Record<string, unknown>;
}): RuntimeStep {
  return {
    stage: input.stage,
    status: input.status,
    durationMs: input.durationMs,
    metadata: input.metadata ?? {},
  };
}

export function toRuntimeExecutionResponse(input: {
  runtimeId: string;
  executionId: string;
  session: RuntimeSession;
  correlationId: string | null;
  executionTimeMs: number;
  intentKey: string | null;
  providerKey: string | null;
  responseContent: string;
  steps: RuntimeStep[];
  tokenUsage: RuntimeExecutionResponse["tokenUsage"];
}): RuntimeExecutionResponse {
  return {
    runtimeId: input.runtimeId,
    executionId: input.executionId,
    session: input.session,
    correlationId: input.correlationId,
    executionTimeMs: input.executionTimeMs,
    intentKey: input.intentKey,
    providerKey: input.providerKey,
    responseContent: input.responseContent,
    steps: input.steps,
    tokenUsage: input.tokenUsage,
  };
}
