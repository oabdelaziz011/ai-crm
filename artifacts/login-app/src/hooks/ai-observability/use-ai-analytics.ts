import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useAIObservabilityServices } from "@/lib/ai-observability";

export function useAiAnalyticsAggregate(limit = 200) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { services, context } = useAIObservabilityServices();

  return useQuery({
    queryKey: ["ai-analytics-aggregate", companyId, limit],
    enabled: Boolean(companyId),
    staleTime: 30_000,
    queryFn: async () => {
      if (!companyId) return null;
      return services.analytics.aggregateMetrics(context, { companyId, limit });
    },
  });
}

export function useAiAnalyticsRecords(limit = 50) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { services, context } = useAIObservabilityServices();

  return useQuery({
    queryKey: ["ai-analytics-records", companyId, limit],
    enabled: Boolean(companyId),
    staleTime: 15_000,
    queryFn: async () => {
      if (!companyId) return [];
      return services.analytics.listAnalytics(context, { companyId, limit });
    },
  });
}

export function useAiTraces(limit = 50) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { services, context } = useAIObservabilityServices();

  return useQuery({
    queryKey: ["ai-traces", companyId, limit],
    enabled: Boolean(companyId),
    staleTime: 15_000,
    queryFn: async () => {
      if (!companyId) return [];
      return services.trace.listTraces(context, { companyId, limit });
    },
  });
}
