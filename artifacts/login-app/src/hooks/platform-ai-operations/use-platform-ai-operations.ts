import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { PlatformAiOperationsService } from "@/lib/platform-ai-operations";

const OPS_QUERY_KEY = "platform-ai-operations";

function useOpsService() {
  return useMemo(() => new PlatformAiOperationsService(supabase), []);
}

export function usePlatformAiOpsKpis(enabled: boolean) {
  const service = useOpsService();
  return useQuery({
    queryKey: [OPS_QUERY_KEY, "kpis"],
    enabled,
    refetchInterval: 30_000,
    queryFn: () => service.getKpis(),
  });
}

export function usePlatformAiOpsProviderHealth(enabled: boolean) {
  const service = useOpsService();
  return useQuery({
    queryKey: [OPS_QUERY_KEY, "provider-health"],
    enabled,
    refetchInterval: 30_000,
    queryFn: () => service.getProviderHealth("openai"),
  });
}

export function usePlatformAiOpsRequestFeed(enabled: boolean, search: string, page: number, pageSize = 50) {
  const service = useOpsService();
  return useQuery({
    queryKey: [OPS_QUERY_KEY, "requests", search, page, pageSize],
    enabled,
    refetchInterval: 15_000,
    queryFn: () =>
      service.getRequestFeed({
        limit: pageSize,
        offset: page * pageSize,
        search: search || undefined,
      }),
  });
}

export function usePlatformAiOpsToolStats(enabled: boolean) {
  const service = useOpsService();
  return useQuery({
    queryKey: [OPS_QUERY_KEY, "tools"],
    enabled,
    queryFn: () => service.getToolStats(),
  });
}

export function usePlatformAiOpsBackgroundTasks(enabled: boolean) {
  const service = useOpsService();
  return useQuery({
    queryKey: [OPS_QUERY_KEY, "background-tasks"],
    enabled,
    refetchInterval: 10_000,
    queryFn: () => service.getBackgroundTasks(50),
  });
}

export function usePlatformAiOpsAgentWorkflows(enabled: boolean) {
  const service = useOpsService();
  return useQuery({
    queryKey: [OPS_QUERY_KEY, "agent-workflows"],
    enabled,
    refetchInterval: 10_000,
    queryFn: () => service.getAgentWorkflows(25),
  });
}

export function usePlatformAiOpsKnowledgeSummary(enabled: boolean) {
  const service = useOpsService();
  return useQuery({
    queryKey: [OPS_QUERY_KEY, "knowledge-summary"],
    enabled,
    refetchInterval: 15_000,
    queryFn: () => service.getKnowledgeSummary(),
  });
}

export function usePlatformAiOpsKnowledgeDocuments(enabled: boolean) {
  const service = useOpsService();
  return useQuery({
    queryKey: [OPS_QUERY_KEY, "knowledge-documents"],
    enabled,
    refetchInterval: 15_000,
    queryFn: () => service.getKnowledgeDocuments(25),
  });
}

export function usePlatformAiOpsEmbeddingJobs(enabled: boolean) {
  const service = useOpsService();
  return useQuery({
    queryKey: [OPS_QUERY_KEY, "embedding-jobs"],
    enabled,
    refetchInterval: 10_000,
    queryFn: () => service.getEmbeddingJobs(30),
  });
}

export function usePlatformAiOpsErrorGroups(enabled: boolean) {
  const service = useOpsService();
  return useQuery({
    queryKey: [OPS_QUERY_KEY, "errors"],
    enabled,
    queryFn: () => service.getErrorGroups(25),
  });
}

export function usePlatformAiOpsCostTrends(enabled: boolean, days = 30) {
  const service = useOpsService();
  return useQuery({
    queryKey: [OPS_QUERY_KEY, "cost-trends", days],
    enabled,
    queryFn: () => service.getCostTrends(days),
  });
}

export function usePlatformAiOpsCostByCompany(enabled: boolean) {
  const service = useOpsService();
  return useQuery({
    queryKey: [OPS_QUERY_KEY, "cost-by-company"],
    enabled,
    queryFn: () => service.getCostByCompany(10),
  });
}

export function usePlatformAiOpsFeatureMatrix(enabled: boolean) {
  const service = useOpsService();
  return useQuery({
    queryKey: [OPS_QUERY_KEY, "feature-matrix"],
    enabled,
    queryFn: () => service.getFeatureMatrix(),
  });
}

export function usePlatformAiOpsAdminAudit(enabled: boolean) {
  const service = useOpsService();
  return useQuery({
    queryKey: [OPS_QUERY_KEY, "audit"],
    enabled,
    queryFn: () => service.getAdminAudit(50),
  });
}

export function usePlatformAiOpsAlerts(enabled: boolean) {
  const service = useOpsService();
  return useQuery({
    queryKey: [OPS_QUERY_KEY, "alerts"],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      await service.evaluateAlerts();
      return service.getRecentAlerts(10);
    },
  });
}
