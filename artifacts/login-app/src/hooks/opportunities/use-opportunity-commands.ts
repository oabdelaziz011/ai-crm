import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useCompanyPermissionAuth } from "@/hooks/billing/use-company-permission-auth";
import {
  buildApplicationContext,
  createLoginAppApplicationLayerRegistry,
  permissionCodes,
} from "@/lib/application-layer/application-layer-bootstrap";
import {
  unwrapCommandResult,
  unwrapQueryResult,
} from "@/lib/application-layer/application-layer-result";

export function useOpportunityServices() {
  const { user, company } = useAuth();
  const {
    hasCompanyPermission,
    isSuperAdmin,
    buildPortContext,
  } = useCompanyPermissionAuth();

  const contextFactory = () => {
    if (!company?.id || !user?.id) throw new Error("Not authenticated");
    return buildApplicationContext({
      tenantId: company.id,
      actorId: user.id,
      permissions: permissionCodes(hasCompanyPermission, isSuperAdmin),
    });
  };

  const servicesFactory = () => {
    return createLoginAppApplicationLayerRegistry(buildPortContext()).getServices();
  };

  return {
    companyId: company?.id ?? null,
    contextFactory,
    servicesFactory,
    hasPermission: hasCompanyPermission,
    isSuperAdmin,
  };
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
      return unwrapQueryResult(result);
    },
  });
}

export type OpportunityListQueryFilter = {
  pipelineId?: string;
  stageId?: string;
  ownerUserId?: string;
  leadId?: string;
  query?: string;
  outcome?: "open" | "won" | "lost";
  leadLifecycleStatus?: string;
  openOnly?: boolean;
  limit?: number;
  offset?: number;
};

export function useOpportunityList(filter: OpportunityListQueryFilter = {}) {
  const { companyId, contextFactory, servicesFactory, hasPermission, isSuperAdmin } =
    useOpportunityServices();
  const canView = isSuperAdmin || hasPermission("opportunities.view");
  const limit = filter.limit ?? 50;
  const offset = filter.offset ?? 0;
  const stageId = filter.stageId?.trim() || undefined;
  const ownerUserId = filter.ownerUserId?.trim() || undefined;
  const pipelineId = filter.pipelineId?.trim() || undefined;
  const leadId = filter.leadId?.trim() || undefined;
  const query = filter.query?.trim() || undefined;
  const outcome = filter.outcome;
  const leadLifecycleStatus = filter.leadLifecycleStatus?.trim() || undefined;
  const openOnly = filter.openOnly;

  return useQuery({
    queryKey: [
      "opportunities-workspace",
      "list",
      companyId,
      pipelineId ?? null,
      stageId ?? null,
      ownerUserId ?? null,
      leadId ?? null,
      query ?? null,
      outcome ?? null,
      leadLifecycleStatus ?? null,
      openOnly ?? null,
      limit,
      offset,
    ],
    enabled: Boolean(companyId && canView),
    queryFn: async () => {
      const result = await servicesFactory().opportunity.listOpportunities(
        {
          pipelineId,
          stageId,
          ownerUserId,
          leadId,
          query,
          outcome,
          leadLifecycleStatus,
          openOnly,
          limit,
          offset,
        },
        contextFactory(),
      );
      return unwrapQueryResult(result);
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
      return unwrapQueryResult(result);
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
      return {
        opportunity: unwrapQueryResult(opp),
        history: unwrapQueryResult(history),
      };
    },
  });
}

export function useOpportunityPermissions() {
  const { hasPermission, isSuperAdmin } = useOpportunityServices();
  return {
    canView: isSuperAdmin || hasPermission("opportunities.view"),
    canEdit: isSuperAdmin || hasPermission("opportunities.edit"),
    canCreate: isSuperAdmin || hasPermission("opportunities.create"),
    canConvert: isSuperAdmin || hasPermission("opportunities.convert"),
    canArchive: isSuperAdmin || hasPermission("opportunities.delete"),
  };
}

export function useOpportunityCommands() {
  const { contextFactory, servicesFactory } = useOpportunityServices();
  const qc = useQueryClient();

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["opportunities-workspace"] });
    void qc.invalidateQueries({ queryKey: ["opportunity360-workspace"] });
    void qc.invalidateQueries({ queryKey: ["quotes-workspace"] });
    void qc.invalidateQueries({ queryKey: ["lead360-workspace"] });
    void qc.invalidateQueries({ queryKey: ["leads-workspace"] });
    void qc.invalidateQueries({ queryKey: ["leads"] });
    void qc.invalidateQueries({ queryKey: ["lead"] });
    void qc.invalidateQueries({ queryKey: ["leadMetrics"] });
    void qc.invalidateQueries({ queryKey: ["kanban"] });
    void qc.invalidateQueries({ queryKey: ["customers"] });
    void qc.invalidateQueries({ queryKey: ["customer"] });
    void qc.invalidateQueries({ queryKey: ["customer360-workspace"] });
  };

  const createFromLead = useMutation({
    mutationFn: async (input: {
      leadId: string;
      name?: string;
      companyName?: string;
      primaryContactName?: string;
      ownerUserId?: string;
      expectedRevenue?: number | null;
      currency?: string;
      expectedCloseDate?: string | null;
      stageId?: string;
      pipelineId?: string;
      forceCreate?: boolean;
      primaryProductId?: string;
      probabilityPercent?: number;
      probabilitySource?: string;
      probabilityReason?: string;
      metadata?: Record<string, unknown>;
    }) => {
      const result = await servicesFactory().opportunity.createFromLead(input, contextFactory());
      return unwrapCommandResult(result);
    },
    onSuccess: invalidate,
  });

  const create = useMutation({
    mutationFn: async (input: {
      name: string;
      companyName?: string;
      primaryContactName?: string;
      ownerUserId?: string;
      expectedRevenue?: number;
      currency?: string;
      expectedCloseDate?: string | null;
      stageId?: string;
      pipelineId?: string;
      customerId?: string;
      primaryProductId?: string;
      probabilityPercent?: number;
      probabilitySource?: string;
      probabilityReason?: string;
      metadata?: Record<string, unknown>;
    }) => {
      const result = await servicesFactory().opportunity.createOpportunity(input, contextFactory());
      return unwrapCommandResult(result);
    },
    onSuccess: invalidate,
  });

  const changeStage = useMutation({
    mutationFn: async (input: {
      opportunityId: string;
      stageId: string;
      lostReason?: string | null;
    }) => {
      const result = await servicesFactory().opportunity.changeStage(input, contextFactory());
      return unwrapCommandResult(result);
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async (input: {
      opportunityId: string;
      patch: {
        name?: string;
        expectedRevenue?: number | null;
        currency?: string;
        expectedCloseDate?: string | null;
        ownerUserId?: string | null;
        companyName?: string | null;
        primaryContactName?: string;
        country?: string | null;
        market?: string | null;
      };
    }) => {
      const result = await servicesFactory().opportunity.updateOpportunity(input, contextFactory());
      return unwrapCommandResult(result);
    },
    onSuccess: invalidate,
  });

  const updateProbability = useMutation({
    mutationFn: async (input: {
      opportunityId: string;
      percent: number;
      confidence?: number | null;
      source?: string;
      reason?: string;
    }) => {
      const result = await servicesFactory().opportunity.updateProbability(input, contextFactory());
      return unwrapCommandResult(result);
    },
    onSuccess: invalidate,
  });

  const archive = useMutation({
    mutationFn: async (input: { opportunityId: string }) => {
      const result = await servicesFactory().opportunity.archiveOpportunity(input, contextFactory());
      unwrapCommandResult(result);
    },
    onSuccess: invalidate,
  });

  return { createFromLead, create, changeStage, update, updateProbability, archive };
}
