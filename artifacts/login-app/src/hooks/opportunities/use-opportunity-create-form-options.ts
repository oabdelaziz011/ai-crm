import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import {
  useOpportunityPipelines,
  useOpportunityServices,
} from "@/hooks/opportunities/use-opportunity-commands";
import { getCompanyCurrency } from "@/lib/company-locale/runtime";
import { unwrapQueryResult } from "@/lib/application-layer/application-layer-result";
import { EmployeeIdentityService } from "@/lib/employee-identity/employee-identity-service";
import type { OpportunityFormOption } from "@/components/opportunities/opportunity-form-draft";

export function useOpportunityStages(pipelineId: string | null) {
  const { companyId, contextFactory, servicesFactory, hasPermission, isSuperAdmin } =
    useOpportunityServices();
  const canView = isSuperAdmin || hasPermission("opportunities.view");

  return useQuery({
    queryKey: ["opportunities-workspace", "stages", companyId, pipelineId],
    enabled: Boolean(companyId && pipelineId && canView),
    queryFn: async () => {
      if (!pipelineId) return [];
      const result = await servicesFactory().opportunity.listStages({ pipelineId }, contextFactory());
      return unwrapQueryResult(result);
    },
  });
}

export function useExistingOpportunityForLead(leadId: string | null, enabled: boolean) {
  const { companyId, contextFactory, servicesFactory, hasPermission, isSuperAdmin } =
    useOpportunityServices();
  const canView = isSuperAdmin || hasPermission("opportunities.view");

  return useQuery({
    queryKey: ["opportunities-workspace", "by-lead", companyId, leadId],
    enabled: Boolean(companyId && leadId && canView && enabled),
    queryFn: async () => {
      if (!leadId) return null;
      const result = await servicesFactory().opportunity.listOpportunities(
        { leadId, limit: 1, offset: 0 },
        contextFactory(),
      );
      const page = unwrapQueryResult(result);
      return page.items[0] ?? null;
    },
  });
}

export function useOpportunityCreateFormOptions() {
  const { user, company } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const pipelinesQuery = useOpportunityPipelines();

  const defaultPipeline = useMemo(() => {
    const pipelines = pipelinesQuery.data ?? [];
    return pipelines.find((pipeline) => pipeline.isDefault) ?? pipelines[0] ?? null;
  }, [pipelinesQuery.data]);

  const stagesQuery = useOpportunityStages(defaultPipeline?.id ?? null);

  const ownersQuery = useQuery({
    queryKey: ["opportunities-workspace", "owners", company?.id],
    enabled: Boolean(company?.id && (isSuperAdmin || hasPermission("opportunities.view"))),
    queryFn: () => EmployeeIdentityService.listByCompany(company!.id),
    staleTime: 60_000,
  });

  const stageOptions = useMemo((): OpportunityFormOption[] => {
    return (stagesQuery.data ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((stage) => ({ id: stage.id, label: stage.name }));
  }, [stagesQuery.data]);

  const ownerOptions = useMemo((): OpportunityFormOption[] => {
    const map = new Map<string, string>();
    for (const owner of ownersQuery.data ?? []) {
      if (!owner.userId) continue;
      map.set(owner.userId, owner.fullName);
    }
    if (user?.id && !map.has(user.id)) {
      const selfName =
        (user as { user_metadata?: { full_name?: string } } | null)?.user_metadata?.full_name ||
        user.email ||
        user.id;
      map.set(user.id, selfName);
    }
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [ownersQuery.data, user]);

  const defaultStageId = stageOptions[0]?.id ?? "";
  const companyCurrency = getCompanyCurrency();

  return {
    isLoading: pipelinesQuery.isLoading || stagesQuery.isLoading || ownersQuery.isLoading,
    pipelineOptions: (pipelinesQuery.data ?? []).map((pipeline) => ({
      id: pipeline.id,
      label: pipeline.name,
    })),
    stageOptions,
    ownerOptions,
    defaultPipelineId: defaultPipeline?.id ?? "",
    defaultStageId,
    defaultOwnerUserId: user?.id ?? "",
    companyCurrency,
  };
}
