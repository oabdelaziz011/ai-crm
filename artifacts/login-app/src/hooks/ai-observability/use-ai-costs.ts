import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useAIObservabilityServices } from "@/lib/ai-observability";

export function aiCostAggregateQueryKey(companyId: string | null, billingPeriod?: string) {
  return ["ai-cost-aggregate", companyId, billingPeriod] as const;
}

export function useAiCostAggregate(billingPeriod?: string) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { services, context } = useAIObservabilityServices();

  return useQuery({
    queryKey: aiCostAggregateQueryKey(companyId, billingPeriod),
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async () => {
      if (!companyId) return null;
      return services.costs.aggregateCompanyCosts(context, { companyId, billingPeriod });
    },
  });
}

export function useAiCostRecords(limit = 50) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { services, context } = useAIObservabilityServices();

  return useQuery({
    queryKey: ["ai-cost-records", companyId, limit],
    enabled: Boolean(companyId),
    staleTime: 30_000,
    queryFn: async () => {
      if (!companyId) return [];
      return services.costs.listCostRecords(context, { companyId, limit });
    },
  });
}
