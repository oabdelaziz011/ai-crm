/**
 * Single source of truth for Platform AI database / RPC feature identifiers.
 *
 * These keys are stored in `platform_ai_feature_flags.feature_key` and passed to
 * `platform_ai_feature_enabled(company_id, feature_key)`.
 *
 * Sprint 1: architecture only — adding a key here does not enable runtime enforcement.
 */

export const PLATFORM_AI_FEATURE_KEY = {
  AI_CHAT: "ai_chat",
  TOOL_CALLING: "tool_calling",
  KNOWLEDGE: "knowledge",
  AUTOMATION: "automation",
  VOICE: "voice",
  EMBEDDINGS: "embeddings",
  /** Prepared in Sprint 1 — not wired to catalog, ops, or runtime guards yet. */
  AI_ANALYTICS: "ai_analytics",
} as const;

/** All valid Platform AI feature flag keys (matches DB check constraint). */
export const PLATFORM_AI_FEATURE_KEYS = Object.values(PLATFORM_AI_FEATURE_KEY);

export type PlatformAIFeatureKey = (typeof PLATFORM_AI_FEATURE_KEY)[keyof typeof PLATFORM_AI_FEATURE_KEY];

/**
 * Feature keys shown in the Platform AI Operations company matrix.
 * Intentionally excludes `embeddings` and `ai_analytics` until a future sprint wires them.
 */
export const PLATFORM_AI_OPS_MATRIX_FEATURE_KEYS = [
  PLATFORM_AI_FEATURE_KEY.AI_CHAT,
  PLATFORM_AI_FEATURE_KEY.TOOL_CALLING,
  PLATFORM_AI_FEATURE_KEY.KNOWLEDGE,
  PLATFORM_AI_FEATURE_KEY.AUTOMATION,
  PLATFORM_AI_FEATURE_KEY.VOICE,
] as const;

export type PlatformAiOpsMatrixFeatureKey = (typeof PLATFORM_AI_OPS_MATRIX_FEATURE_KEYS)[number];

export function isPlatformAIFeatureKey(value: string): value is PlatformAIFeatureKey {
  return (PLATFORM_AI_FEATURE_KEYS as readonly string[]).includes(value);
}
