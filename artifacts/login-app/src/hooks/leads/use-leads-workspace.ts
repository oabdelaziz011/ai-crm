import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import {
  buildApplicationContext,
  createLoginAppApplicationLayerRegistry,
  permissionCodes,
} from "@/lib/application-layer/application-layer-bootstrap";
import { mapLeadReadModelToWorkspaceRow } from "@/lib/application-layer/lead-workspace-row-mapper";
import type { ApplicationPorts } from "@workspace/application-layer";
import type { LeadWorkspaceRow } from "@workspace/universal-operations-engine";

export function useLeadsQueue(filter?: {
  search?: string;
  stageId?: string;
  pipelineId?: string;
  assignedUserId?: string;
  lifecycleStatus?: string;
  limit?: number;
  offset?: number;
}) {
  const { user, company } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();

  return useQuery({
    queryKey: ["leads-workspace", "list", company?.id, filter],
    enabled: Boolean(company?.id && user?.id && (isSuperAdmin || hasPermission("leads.view"))),
    queryFn: async () => {
      const registry = createLoginAppApplicationLayerRegistry({
        companyId: company!.id,
        actorUserId: user!.id,
        isSuperAdmin,
        hasPermission,
      });
      const services = registry.getServices();
      const context = buildApplicationContext({
        tenantId: company!.id,
        actorId: user!.id,
        permissions: permissionCodes(hasPermission, isSuperAdmin),
      });
      const result = await services.lead.listLeads(filter ?? {}, context);
      return Object.freeze({
        rows: result.data.items.map((lead) => mapLeadReadModelToWorkspaceRow(lead)) as LeadWorkspaceRow[],
        total: result.data.total,
      });
    },
    staleTime: 30_000,
  });
}

export function useLeadPipelines() {
  const { user, company } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();

  return useQuery({
    queryKey: ["leads-workspace", "pipelines", company?.id],
    enabled: Boolean(company?.id && user?.id && (isSuperAdmin || hasPermission("leads.view"))),
    queryFn: async () => {
      const registry = createLoginAppApplicationLayerRegistry({
        companyId: company!.id,
        actorUserId: user!.id,
        isSuperAdmin,
        hasPermission,
      });
      const ports = registry.resolve<ApplicationPorts>("ports");
      return ports.leadRead.listPipelines(company!.id);
    },
    staleTime: 60_000,
  });
}

export function useLeadKanbanBoard(pipelineId: string | null) {
  const { user, company } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();

  return useQuery({
    queryKey: ["leads-workspace", "kanban", company?.id, pipelineId],
    enabled: Boolean(company?.id && user?.id && pipelineId && (isSuperAdmin || hasPermission("leads.view"))),
    queryFn: async () => {
      const registry = createLoginAppApplicationLayerRegistry({
        companyId: company!.id,
        actorUserId: user!.id,
        isSuperAdmin,
        hasPermission,
      });
      const services = registry.getServices();
      const context = buildApplicationContext({
        tenantId: company!.id,
        actorId: user!.id,
        permissions: permissionCodes(hasPermission, isSuperAdmin),
      });
      const result = await services.lead.getPipelineBoard({ pipelineId: pipelineId! }, context);
      return result.data;
    },
    staleTime: 15_000,
  });
}

export function useLeadDashboardMetrics() {
  const { user, company } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();

  return useQuery({
    queryKey: ["leads-workspace", "dashboard", company?.id],
    enabled: Boolean(company?.id && user?.id && (isSuperAdmin || hasPermission("leads.view"))),
    queryFn: async () => {
      const registry = createLoginAppApplicationLayerRegistry({
        companyId: company!.id,
        actorUserId: user!.id,
        isSuperAdmin,
        hasPermission,
      });
      const services = registry.getServices();
      const context = buildApplicationContext({
        tenantId: company!.id,
        actorId: user!.id,
        permissions: permissionCodes(hasPermission, isSuperAdmin),
      });
      const result = await services.lead.getDashboardMetrics({}, context);
      return result.data;
    },
    staleTime: 30_000,
  });
}
