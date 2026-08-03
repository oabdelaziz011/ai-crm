import type { ServiceContext } from "@workspace/ai-tool-router";
import { createToolRouterServices, type CreateToolRouterServicesOptions } from "@workspace/ai-tool-router";
import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { supabase } from "@/lib/supabase";
import { createToolCustomerServicePort } from "./customer-service-adapter";
import { useCrmAgentToolPorts } from "./use-crm-agent-tool-ports";
import { createApplicationLayerSchedulingToolPorts } from "@/lib/application-layer/application-layer-scheduling-tool-ports";
import { createApplicationLayerLeadToolPorts } from "@/lib/application-layer/application-layer-lead-tool-ports";
import { createApplicationLayerTicketToolPorts } from "@/lib/application-layer/application-layer-ticket-tool-ports";
import { createApplicationLayerHandoffToolPorts } from "@/lib/application-layer/application-layer-handoff-tool-ports";

/**
 * Factory hook for Tool Router domain services.
 * All domain tool ports route through Application Layer services.
 */
export function useToolRouterServices() {
  const { user, profile, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const crmAgentPorts = useCrmAgentToolPorts();

  const portContext = useMemo(() => {
    if (!profile?.company_id || !user?.id) return null;
    return {
      companyId: profile.company_id,
      actorUserId: user.id,
      isSuperAdmin,
      hasPermission,
    };
  }, [profile?.company_id, user?.id, isSuperAdmin, hasPermission]);

  const createOptions = useMemo<CreateToolRouterServicesOptions>(
    () => ({
      customerService: createToolCustomerServicePort(
        () => user?.id ?? null,
        () => profile?.company_id ?? null,
        hasPermission,
        isSuperAdmin,
      ),
      crmAgentPorts,
      schedulingToolPorts: portContext ? createApplicationLayerSchedulingToolPorts(portContext) : undefined,
      ticketAgentPorts: portContext ? createApplicationLayerTicketToolPorts(portContext) : undefined,
      leadAgentPorts: portContext ? createApplicationLayerLeadToolPorts(portContext) : undefined,
      handoffAgentPorts: portContext ? createApplicationLayerHandoffToolPorts(portContext) : undefined,
      includeMockTools: false,
    }),
    [user?.id, profile?.company_id, isSuperAdmin, hasPermission, crmAgentPorts, portContext],
  );

  const services = useMemo(
    () => createToolRouterServices(supabase, createOptions),
    [createOptions],
  );

  const context = useMemo<ServiceContext>(
    () => ({
      userId: user?.id ?? null,
      companyId: profile?.company_id ?? null,
      isSuperAdmin,
      hasPermission,
    }),
    [user?.id, profile?.company_id, isSuperAdmin, hasPermission],
  );

  return { services, context, createOptions };
}
