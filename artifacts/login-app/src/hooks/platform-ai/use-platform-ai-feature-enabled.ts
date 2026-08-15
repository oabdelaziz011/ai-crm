import { LEGACY_AI_FEATURE_KEY_MAP } from "@workspace/configuration-platform";
import {
  PLATFORM_AI_FEATURE_KEY,
  type PlatformAIFeatureKey,
} from "@workspace/platform-ai-provider";
import { useCallback } from "react";
import { useFeatureFlag } from "@/hooks/use-feature-flag";

export function platformAiFeatureQueryKey(companyId: string | null, featureKey: PlatformAIFeatureKey) {
  return ["platform-ai-feature", companyId, featureKey] as const;
}

export function usePlatformAIFeatureEnabled(featureKey: PlatformAIFeatureKey) {
  // Runtime resolves unified keys (`ai.chat`); map legacy catalog keys (`ai_chat`) first.
  const resolved = useFeatureFlag(LEGACY_AI_FEATURE_KEY_MAP[featureKey] ?? featureKey);

  return {
    isLoading: resolved.isLoading,
    /** Resolved value; defaults to true while loading (runtime missing-row semantics). */
    isEnabled: resolved.isEnabled,
    /** Undefined until the first fetch completes. */
    resolvedEnabled: resolved.resolvedEnabled,
    licenseBlocked: resolved.licenseBlocked,
    licenseReason: resolved.licenseReason,
  };
}

export function useKnowledgeFeatureEnabled() {
  return usePlatformAIFeatureEnabled(PLATFORM_AI_FEATURE_KEY.KNOWLEDGE);
}

export function useWorkflowFeatureEnabled() {
  return usePlatformAIFeatureEnabled(PLATFORM_AI_FEATURE_KEY.AUTOMATION);
}

export function useAiChatFeatureEnabled() {
  return usePlatformAIFeatureEnabled(PLATFORM_AI_FEATURE_KEY.AI_CHAT);
}

export function useToolCallingFeatureEnabled() {
  return usePlatformAIFeatureEnabled(PLATFORM_AI_FEATURE_KEY.TOOL_CALLING);
}

export function useEmbeddingsFeatureEnabled() {
  return usePlatformAIFeatureEnabled(PLATFORM_AI_FEATURE_KEY.EMBEDDINGS);
}

export function useAnalyticsFeatureEnabled() {
  return usePlatformAIFeatureEnabled(PLATFORM_AI_FEATURE_KEY.AI_ANALYTICS);
}

export function useAgentsFeatureEnabled() {
  return usePlatformAIFeatureEnabled(PLATFORM_AI_FEATURE_KEY.AI_AGENTS);
}

export type PlatformFeatureEnabledLookup = (
  featureKey: PlatformAIFeatureKey,
) => boolean | undefined;

export function usePlatformFeatureEnabledLookup(): PlatformFeatureEnabledLookup {
  const knowledge = useKnowledgeFeatureEnabled();
  const workflow = useWorkflowFeatureEnabled();
  const analytics = useAnalyticsFeatureEnabled();
  const agents = useAgentsFeatureEnabled();

  return useCallback(
    (featureKey: PlatformAIFeatureKey) => {
      if (featureKey === PLATFORM_AI_FEATURE_KEY.KNOWLEDGE) {
        return knowledge.resolvedEnabled;
      }
      if (featureKey === PLATFORM_AI_FEATURE_KEY.AUTOMATION) {
        return workflow.resolvedEnabled;
      }
      if (featureKey === PLATFORM_AI_FEATURE_KEY.AI_ANALYTICS) {
        return analytics.resolvedEnabled;
      }
      if (featureKey === PLATFORM_AI_FEATURE_KEY.AI_AGENTS) {
        return agents.resolvedEnabled;
      }
      return undefined;
    },
    [knowledge.resolvedEnabled, workflow.resolvedEnabled, analytics.resolvedEnabled, agents.resolvedEnabled],
  );
}
