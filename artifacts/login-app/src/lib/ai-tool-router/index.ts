import type { ServiceContext } from "@workspace/ai-tool-router";
import { createToolRouterServices, type CreateToolRouterServicesOptions } from "@workspace/ai-tool-router";
import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { supabase } from "@/lib/supabase";
import { createToolCustomerServicePort } from "./customer-service-adapter";
import { useCrmAgentToolPorts } from "./use-crm-agent-tool-ports";
import { createLoginAppSchedulingToolPorts } from "./scheduling-tool-ports-adapter";

/**
 * Factory hook for Tool Router domain services.
 * Business logic lives in @workspace/ai-tool-router — not in UI.
 */
export function useToolRouterServices() {
  const { user, profile, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const crmAgentPorts = useCrmAgentToolPorts();

  const createOptions = useMemo<CreateToolRouterServicesOptions>(
    () => ({
      customerService: createToolCustomerServicePort(() => user?.id ?? null),
      crmAgentPorts,
      schedulingToolPorts: createLoginAppSchedulingToolPorts(supabase),
    }),
    [user?.id, crmAgentPorts],
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
