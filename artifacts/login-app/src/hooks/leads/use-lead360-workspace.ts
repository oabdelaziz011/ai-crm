import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useCompanyPermissionAuth } from "@/hooks/billing/use-company-permission-auth";
import {
  buildApplicationContext,
  createLoginAppApplicationLayerRegistry,
  permissionCodes,
} from "@/lib/application-layer/application-layer-bootstrap";
import type { Lead360AggregateDto } from "@workspace/application-layer";
import { toAiStatusDto } from "@workspace/application-layer";
import {
  resolveLead360Sections,
  DEFAULT_LEAD360_SECTIONS,
  type Lead360WorkspaceRole,
} from "@workspace/universal-operations-engine";
import { createLoginAppLeadSmartCapturePort } from "@/lib/lead-intelligence/lead-smart-capture-port";
import { loadLead360AiPanel } from "@/lib/lead-intelligence/lead360-ai-loader";
import type { Lead360AiPanelDto } from "@/lib/lead-intelligence/lead360-ai-types";
import { supabase } from "@/lib/supabase";

export type Lead360WorkspaceData = Lead360AggregateDto & {
  aiPanel?: Lead360AiPanelDto;
};

export function useLead360Workspace(leadId: string | null, role: Lead360WorkspaceRole = "sales_manager") {
  const { user, company } = useAuth();
  const { hasCompanyPermission, isSuperAdmin, buildPortContext } = useCompanyPermissionAuth();

  const sections = resolveLead360Sections(
    DEFAULT_LEAD360_SECTIONS,
    role,
    (code) => isSuperAdmin || hasCompanyPermission(code),
  );

  const query = useQuery({
    queryKey: ["lead360-workspace", leadId, company?.id, role],
    enabled: Boolean(
      leadId && company?.id && user?.id && (isSuperAdmin || hasCompanyPermission("leads.view")),
    ),
    queryFn: async (): Promise<Lead360WorkspaceData | null> => {
      const registry = createLoginAppApplicationLayerRegistry(buildPortContext());
      const services = registry.getServices();
      const context = buildApplicationContext({
        tenantId: company!.id,
        actorId: user!.id,
        permissions: permissionCodes(hasCompanyPermission, isSuperAdmin),
      });
      const result = await services.lead.getLead360Aggregate(
        { leadId: leadId!, role, visibleSections: sections.map((s) => s.id) },
        context,
      );
      const aggregate = result.data;
      if (!aggregate) return null;

      const smartCapture = createLoginAppLeadSmartCapturePort(supabase);
      let aiAudit: Lead360AggregateDto["aiAudit"];
      try {
        aiAudit = await smartCapture.listAudit(company!.id, leadId!, 40);
      } catch {
        aiAudit = undefined;
      }

      let aiPanel: Lead360AiPanelDto | undefined;
      try {
        aiPanel = await loadLead360AiPanel(supabase, company!.id, leadId!);
      } catch {
        aiPanel = undefined;
      }

      return Object.freeze({
        ...aggregate,
        aiStatus: aggregate.aiStatus ?? aggregate.lead.aiStatus ?? toAiStatusDto(null),
        aiAudit,
        aiPanel,
      });
    },
    staleTime: 30_000,
  });

  return { data: query.data, isLoading: query.isLoading, sections, role };
}
