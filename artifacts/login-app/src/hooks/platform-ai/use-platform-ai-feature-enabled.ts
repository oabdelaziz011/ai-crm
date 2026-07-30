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

export type PlatformFeatureEnabledLookup = (
  featureKey: PlatformAIFeatureKey,
) => boolean | undefined;

export function usePlatformFeatureEnabledLookup(): PlatformFeatureEnabledLookup {
  const knowledge = useKnowledgeFeatureEnabled();

  return useCallback(
    (featureKey: PlatformAIFeatureKey) => {
      if (featureKey === PLATFORM_AI_FEATURE_KEY.KNOWLEDGE) {
        return knowledge.resolvedEnabled;
      }
      return undefined;
    },
    [knowledge.resolvedEnabled],
  );
}
