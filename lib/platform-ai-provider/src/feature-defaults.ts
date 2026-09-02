import { PLATFORM_AI_FEATURE_KEY, type PlatformAIFeatureKey } from "./feature-keys.js";

/**
 * ## Unified default semantics (Sprint 1)
 *
 * Two layers intentionally use different missing-row defaults today. This module
 * documents both and exposes shared helpers so future sprints can converge them
 * without scattering magic booleans.
 *
 * ### Runtime layer — `platform_ai_feature_enabled()` (Supabase RPC)
 * - **Model:** fail-closed kill-switch (explicit row required).
 * - **Missing DB row:** `false`.
 * - **Used by:** `PlatformAIProviderService.isFeatureEnabled`, `platform_resolve_ai_runtime_config`.
 *
 * ### Catalog layer — Company AI Access resolver (login-app)
 * - **Model:** applies only when `availability === "live"` and `backendFeatureKey` is set.
 * - **Missing DB row:**
 *   - `ai_chat` → `definition.defaultEnabled ?? true`
 *   - all other live keys → `definition.defaultEnabled ?? false`
 * - **Used by:** `resolveBackendEnabled` in the capability catalog pipeline.
 *
 * Sprint 1 preserves both behaviors exactly. Do not call `resolveCatalogFeatureEnabled`
 * from runtime guards until a dedicated migration sprint aligns product policy.
 */

/** Mirrors fail-closed default in `platform_ai_feature_enabled()` (migration 345). */
export const PLATFORM_AI_RUNTIME_MISSING_ROW_DEFAULT = false as const;

export type PlatformAIFeatureFlagRow = {
  is_enabled: boolean;
};

/**
 * Resolves whether a feature is enabled at **runtime**, matching the Supabase RPC.
 */
export function resolveRuntimeFeatureEnabled(
  flagRow: PlatformAIFeatureFlagRow | undefined,
): boolean {
  return flagRow?.is_enabled ?? PLATFORM_AI_RUNTIME_MISSING_ROW_DEFAULT;
}

/**
 * Resolves whether a **live** catalog capability appears enabled in Company AI Access.
 * Callers must still gate on `availability === "live"` and presence of `backendFeatureKey`.
 */
export function resolveCatalogFeatureEnabled(
  featureKey: PlatformAIFeatureKey,
  flagRow: PlatformAIFeatureFlagRow | undefined,
  definitionDefaultEnabled?: boolean,
): boolean {
  if (flagRow) {
    return flagRow.is_enabled;
  }

  if (featureKey === PLATFORM_AI_FEATURE_KEY.AI_CHAT) {
    return definitionDefaultEnabled ?? true;
  }

  return definitionDefaultEnabled ?? false;
}

/**
 * Documents the catalog default for a key when no DB row exists (for tests and tooling).
 */
export function catalogMissingRowDefault(featureKey: PlatformAIFeatureKey): boolean {
  return resolveCatalogFeatureEnabled(featureKey, undefined);
}
