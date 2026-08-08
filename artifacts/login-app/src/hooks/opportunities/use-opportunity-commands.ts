import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import {
  buildApplicationContext,
  createLoginAppApplicationLayerRegistry,
  permissionCodes,
} from "@/lib/application-layer/application-layer-bootstrap";

function useOpportunityServices() {
  const { user, company } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();

  const contextFactory = () => {
    if (!company?.id || !user?.id) throw new Error("Not authenticated");
    return buildApplicationContext({
      tenantId: company.id,
      actorId: user.id,
      permissions: permissionCodes(hasPermission, isSuperAdmin),
    });
  };

  const servicesFactory = () => {
    if (!company?.id || !user?.id) throw new Error("Not authenticated");
    return createLoginAppApplicationLayerRegistry({
      companyId: company.id,
      actorUserId: user.id,
      isSuperAdmin,
      hasPermission,
    }).getServices();
  };

  return { companyId: company?.id ?? null, contextFactory, servicesFactory, hasPermission, isSuperAdmin };
}

export function useOpportunityPipelines() {
  const { companyId, contextFactory, servicesFactory, hasPermission, isSuperAdmin } =
    useOpportunityServices();
  const canView = isSuperAdmin || hasPermission("opportunities.view");

  return useQuery({
    queryKey: ["opportunities-workspace", "pipelines", companyId],
    enabled: Boolean(companyId && canView),
    queryFn: async () => {
      const result = await servicesFactory().opportunity.listPipelines(contextFactory());
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
  });
}

export function useOpportunityPipelineBoard(pipelineId: string | null) {
  const { companyId, contextFactory, servicesFactory, hasPermission, isSuperAdmin } =
    useOpportunityServices();
  const canView = isSuperAdmin || hasPermission("opportunities.view");

  return useQuery({
    queryKey: ["opportunities-workspace", "board", companyId, pipelineId],
    enabled: Boolean(companyId && pipelineId && canView),
    queryFn: async () => {
      if (!pipelineId) return null;
      const result = await servicesFactory().opportunity.getPipelineBoard(
        { pipelineId },
        contextFactory(),
      );
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
  });
}

export function useOpportunityWorkspace(opportunityId: string | null) {
  const { companyId, contextFactory, servicesFactory, hasPermission, isSuperAdmin } =
    useOpportunityServices();
  const canView = isSuperAdmin || hasPermission("opportunities.view");

  return useQuery({
    queryKey: ["opportunity360-workspace", opportunityId, companyId],
    enabled: Boolean(companyId && opportunityId && canView),
    queryFn: async () => {
      if (!opportunityId) return null;
      const [opp, history] = await Promise.all([
        servicesFactory().opportunity.getOpportunity(opportunityId, contextFactory()),
        servicesFactory().opportunity.listHistory(opportunityId, contextFactory()),
      ]);
      if (!opp.ok) throw new Error(opp.error.message);
      if (!history.ok) throw new Error(history.error.message);
      return { opportunity: opp.data, history: history.data };
    },
  });
}

export function useOpportunityCommands() {
  const { contextFactory, servicesFactory } = useOpportunityServices();
  const qc = useQueryClient();

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["opportunities-workspace"] });
    void qc.invalidateQueries({ queryKey: ["opportunity360-workspace"] });
    void qc.invalidateQueries({ queryKey: ["lead360-workspace"] });
    void qc.invalidateQueries({ queryKey: ["leads-workspace"] });
  };

  const createFromLead = useMutation({
    mutationFn: async (input: { leadId: string; name?: string }) => {
      const result = await servicesFactory().opportunity.createFromLead(input, contextFactory());
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
    onSuccess: invalidate,
  });

  const create = useMutation({
    mutationFn: async (input: {
      name: string;
      companyName?: string;
      primaryContactName?: string;
      expectedRevenue?: number;
      currency?: string;
      expectedCloseDate?: string | null;
    }) => {
      const result = await servicesFactory().opportunity.createOpportunity(input, contextFactory());
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
    onSuccess: invalidate,
  });

  const changeStage = useMutation({
    mutationFn: async (input: { opportunityId: string; stageId: string }) => {
      const result = await servicesFactory().opportunity.changeStage(input, contextFactory());
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
    onSuccess: invalidate,
  });

  return { createFromLead, create, changeStage };
}
