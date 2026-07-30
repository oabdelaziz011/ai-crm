import { PLATFORM_AI_CAPABILITY_ID, type PlatformAICapabilityId } from "./capability-ids.js";
import { PLATFORM_AI_FEATURE_KEY, type PlatformAIFeatureKey } from "./feature-keys.js";

/**
 * Central mapping: catalog capability id → backend feature flag key.
 *
 * Capabilities without a backend key (coming soon, partial, or RBAC-only) are omitted.
 * Live activation in a future sprint sets `availability: "live"` in the catalog AND
 * relies on the mapped key here — do not hardcode keys outside this module.
 */

export type PlatformAICapabilityFeatureMapping = {
  capabilityId: PlatformAICapabilityId;
  backendFeatureKey: PlatformAIFeatureKey;
  /**
   * Optional secondary keys enforced elsewhere (documented only in Sprint 1).
   * Example: workflow AI nodes using tool loops also require `tool_calling`.
   */
  relatedFeatureKeys?: readonly PlatformAIFeatureKey[];
  /** Whether the catalog marks this capability as live today. Sprint 1: only ai_chat. */
  catalogLive: boolean;
};

export const PLATFORM_AI_CAPABILITY_FEATURE_MAPPINGS: readonly PlatformAICapabilityFeatureMapping[] = [
  {
    capabilityId: PLATFORM_AI_CAPABILITY_ID.AI_CHAT,
    backendFeatureKey: PLATFORM_AI_FEATURE_KEY.AI_CHAT,
    catalogLive: true,
  },
  {
    capabilityId: PLATFORM_AI_CAPABILITY_ID.KNOWLEDGE_BASE,
    backendFeatureKey: PLATFORM_AI_FEATURE_KEY.KNOWLEDGE,
    relatedFeatureKeys: [PLATFORM_AI_FEATURE_KEY.EMBEDDINGS],
    catalogLive: true,
  },
  {
    capabilityId: PLATFORM_AI_CAPABILITY_ID.AI_ANALYTICS,
    backendFeatureKey: PLATFORM_AI_FEATURE_KEY.AI_ANALYTICS,
    catalogLive: false,
  },
  {
    capabilityId: PLATFORM_AI_CAPABILITY_ID.WORKFLOW_AI,
    backendFeatureKey: PLATFORM_AI_FEATURE_KEY.AUTOMATION,
    relatedFeatureKeys: [PLATFORM_AI_FEATURE_KEY.TOOL_CALLING],
    catalogLive: false,
  },
] as const;

const CAPABILITY_TO_FEATURE_KEY = new Map<PlatformAICapabilityId, PlatformAIFeatureKey>(
  PLATFORM_AI_CAPABILITY_FEATURE_MAPPINGS.map((entry) => [entry.capabilityId, entry.backendFeatureKey]),
);

const FEATURE_KEY_TO_CAPABILITY_ID = new Map<PlatformAIFeatureKey, PlatformAICapabilityId>(
  PLATFORM_AI_CAPABILITY_FEATURE_MAPPINGS.map((entry) => [entry.backendFeatureKey, entry.capabilityId]),
);

/** Lookup backend feature key for a catalog capability id (null when unmapped). */
export function getBackendFeatureKeyForCapability(
  capabilityId: string,
): PlatformAIFeatureKey | null {
  return CAPABILITY_TO_FEATURE_KEY.get(capabilityId as PlatformAICapabilityId) ?? null;
}

/** Reverse lookup for tooling and audits. */
export function getCapabilityIdForFeatureKey(
  featureKey: PlatformAIFeatureKey,
): PlatformAICapabilityId | null {
  return FEATURE_KEY_TO_CAPABILITY_ID.get(featureKey) ?? null;
}

/** Mapping entry for a capability id, if defined. */
export function getCapabilityFeatureMapping(
  capabilityId: string,
): PlatformAICapabilityFeatureMapping | undefined {
  return PLATFORM_AI_CAPABILITY_FEATURE_MAPPINGS.find((entry) => entry.capabilityId === capabilityId);
}
