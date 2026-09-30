import type { RuntimeExecutionRequest } from "@workspace/runtime-integration";

export type PlatformAiProviderErrorCode =
  | "AI_PROVIDER_NOT_CONFIGURED"
  | "AI_PROVIDER_UNAVAILABLE";

/** Resolved runtime inputs for chat — configuration only, no retrieval execution. */
export type RuntimeChatExecutionConfig = {
  providerConnectionId: string | null;
  knowledgeRetrieval: NonNullable<RuntimeExecutionRequest["knowledgeRetrieval"]> | null;
  ready: boolean;
  missing: Array<"provider" | "embedding" | "vector_store" | "collection">;
  /** True when the ValueOR platform AI provider is active (key configured server-side). */
  platformProviderReady?: boolean;
  /** Structured error when platform provider blocks readiness (never includes secrets). */
  errorCode?: PlatformAiProviderErrorCode | null;
};

export function pickDefaultConnection<T extends { is_default?: boolean; is_enabled?: boolean }>(
  connections: T[],
): T | null {
  return (
    connections.find((item) => item.is_default && item.is_enabled) ??
    connections.find((item) => item.is_enabled) ??
    null
  );
}
