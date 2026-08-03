import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import {
  buildApplicationContext,
  createLoginAppApplicationLayerRegistry,
  permissionCodes,
} from "@/lib/application-layer/application-layer-bootstrap";
import type { Lead360AggregateDto } from "@workspace/application-layer";
import {
  resolveLead360Sections,
  DEFAULT_LEAD360_SECTIONS,
  type Lead360WorkspaceRole,
} from "@workspace/universal-operations-engine";

export function useLead360Workspace(leadId: string | null, role: Lead360WorkspaceRole = "sales_manager") {
  const { user, company } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();

  const sections = resolveLead360Sections(
    DEFAULT_LEAD360_SECTIONS,
    role,
    (code) => isSuperAdmin || hasPermission(code),
  );

  const query = useQuery({
    queryKey: ["lead360-workspace", leadId, company?.id, role],
    enabled: Boolean(leadId && company?.id && user?.id && (isSuperAdmin || hasPermission("leads.view"))),
    queryFn: async (): Promise<Lead360AggregateDto | null> => {
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
      const result = await services.lead.getLead360Aggregate(
        { leadId: leadId!, role, visibleSections: sections.map((s) => s.id) },
        context,
      );
      return result.data;
    },
    staleTime: 60_000,
  });

  return { data: query.data, isLoading: query.isLoading, sections, role };
}
