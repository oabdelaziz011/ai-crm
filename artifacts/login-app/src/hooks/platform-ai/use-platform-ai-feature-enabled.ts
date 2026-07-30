import {
  PLATFORM_AI_FEATURE_KEY,
  type PlatformAIFeatureKey,
} from "@workspace/platform-ai-provider";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { useAuth } from "@/context/auth-context";
import { usePlatformAIProviderServices } from "@/hooks/use-platform-ai-provider";

export function platformAiFeatureQueryKey(companyId: string | null, featureKey: PlatformAIFeatureKey) {
  return ["platform-ai-feature", companyId, featureKey] as const;
}

export function usePlatformAIFeatureEnabled(featureKey: PlatformAIFeatureKey) {
  const { company } = useAuth();
  const { services } = usePlatformAIProviderServices();
  const companyId = company?.id ?? null;

  const query = useQuery({
    queryKey: platformAiFeatureQueryKey(companyId, featureKey),
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async () => {
      if (!companyId) return true;
      return services.platform.isFeatureEnabled(companyId, featureKey);
    },
  });

  return {
    isLoading: query.isLoading,
    /** Resolved value; defaults to true while loading (runtime missing-row semantics). */
    isEnabled: query.data ?? true,
    /** Undefined until the first fetch completes. */
    resolvedEnabled: query.isFetched ? query.data : undefined,
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

export type PlatformFeatureEnabledLookup = (
  featureKey: PlatformAIFeatureKey,
) => boolean | undefined;

export function usePlatformFeatureEnabledLookup(): PlatformFeatureEnabledLookup {
  const knowledge = useKnowledgeFeatureEnabled();
  const workflow = useWorkflowFeatureEnabled();

  return useCallback(
    (featureKey: PlatformAIFeatureKey) => {
      if (featureKey === PLATFORM_AI_FEATURE_KEY.KNOWLEDGE) {
        return knowledge.resolvedEnabled;
      }
      if (featureKey === PLATFORM_AI_FEATURE_KEY.AUTOMATION) {
        return workflow.resolvedEnabled;
      }
      return undefined;
    },
    [knowledge.resolvedEnabled, workflow.resolvedEnabled],
  );
}
