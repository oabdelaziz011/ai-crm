import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useCompanyPermissionAuth } from "@/hooks/billing/use-company-permission-auth";
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
  ownerId?: string;
  lifecycleStatus?: string;
  limit?: number;
  offset?: number;
}) {
  const { user, company } = useAuth();
  const { hasCompanyPermission, isSuperAdmin, buildPortContext } = useCompanyPermissionAuth();

  return useQuery({
    queryKey: ["leads-workspace", "list", company?.id, filter],
    enabled: Boolean(company?.id && user?.id && (isSuperAdmin || hasCompanyPermission("leads.view"))),
    queryFn: async () => {
      const registry = createLoginAppApplicationLayerRegistry(buildPortContext());
      const services = registry.getServices();
      const context = buildApplicationContext({
        tenantId: company!.id,
        actorId: user!.id,
        permissions: permissionCodes(hasCompanyPermission, isSuperAdmin),
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
  const { hasCompanyPermission, isSuperAdmin, buildPortContext } = useCompanyPermissionAuth();

  return useQuery({
    queryKey: ["leads-workspace", "pipelines", company?.id],
    enabled: Boolean(company?.id && user?.id && (isSuperAdmin || hasCompanyPermission("leads.view"))),
    queryFn: async () => {
      const registry = createLoginAppApplicationLayerRegistry(buildPortContext());
      const ports = registry.resolve<ApplicationPorts>("ports");
      return ports.leadRead.listPipelines(company!.id);
    },
    staleTime: 60_000,
  });
}

export function useLeadKanbanBoard(pipelineId: string | null) {
  const { user, company } = useAuth();
  const { hasCompanyPermission, isSuperAdmin, buildPortContext } = useCompanyPermissionAuth();

  return useQuery({
    queryKey: ["leads-workspace", "kanban", company?.id, pipelineId],
    enabled: Boolean(
      company?.id && user?.id && pipelineId && (isSuperAdmin || hasCompanyPermission("leads.view")),
    ),
    queryFn: async () => {
      const registry = createLoginAppApplicationLayerRegistry(buildPortContext());
      const services = registry.getServices();
      const context = buildApplicationContext({
        tenantId: company!.id,
        actorId: user!.id,
        permissions: permissionCodes(hasCompanyPermission, isSuperAdmin),
      });
      const result = await services.lead.getPipelineBoard({ pipelineId: pipelineId! }, context);
      return result.data;
    },
    staleTime: 15_000,
  });
}

export function useLeadDashboardMetrics() {
  const { user, company } = useAuth();
  const { hasCompanyPermission, isSuperAdmin, buildPortContext } = useCompanyPermissionAuth();

  return useQuery({
    queryKey: ["leads-workspace", "dashboard", company?.id],
    enabled: Boolean(company?.id && user?.id && (isSuperAdmin || hasCompanyPermission("leads.view"))),
    queryFn: async () => {
      const registry = createLoginAppApplicationLayerRegistry(buildPortContext());
      const services = registry.getServices();
      const context = buildApplicationContext({
        tenantId: company!.id,
        actorId: user!.id,
        permissions: permissionCodes(hasCompanyPermission, isSuperAdmin),
      });
      const result = await services.lead.getDashboardMetrics({}, context);
      return result.data;
    },
    staleTime: 30_000,
  });
}

export function useLeadStages(pipelineId: string | null) {
  const { user, company } = useAuth();
  const { hasCompanyPermission, isSuperAdmin, buildPortContext } = useCompanyPermissionAuth();

  return useQuery({
    queryKey: ["leads-workspace", "stages", company?.id, pipelineId],
    enabled: Boolean(
      company?.id && user?.id && pipelineId && (isSuperAdmin || hasCompanyPermission("leads.view")),
    ),
    queryFn: async () => {
      const registry = createLoginAppApplicationLayerRegistry(buildPortContext());
      const ports = registry.resolve<ApplicationPorts>("ports");
      return ports.leadRead.listStages(company!.id, pipelineId!);
    },
    staleTime: 60_000,
  });
}

export function useLeadSources() {
  const { user, company } = useAuth();
  const { hasCompanyPermission, isSuperAdmin, buildPortContext } = useCompanyPermissionAuth();

  return useQuery({
    queryKey: ["leads-workspace", "sources", company?.id],
    enabled: Boolean(company?.id && user?.id && (isSuperAdmin || hasCompanyPermission("leads.view"))),
    queryFn: async () => {
      const registry = createLoginAppApplicationLayerRegistry(buildPortContext());
      const ports = registry.resolve<ApplicationPorts>("ports");
      return ports.leadRead.listSources(company!.id);
    },
    staleTime: 60_000,
  });
}
