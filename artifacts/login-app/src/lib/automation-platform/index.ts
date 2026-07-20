import { useMemo } from "react";
import type { ServiceContext } from "@workspace/automation-platform";
import { createAutomationPlatformServices } from "@workspace/automation-platform";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { createAutomationRegistryWithAIWorkflow } from "@/lib/ai-workflow-platform/automation-registry";
import { useAIWorkflowPlatformServices } from "@/lib/ai-workflow-platform";
import { supabase } from "@/lib/supabase";

/**
 * Factory hook for Automation Platform services with AI workflow execution wired
 * into the AutomationEngine action handler registry.
 */
export function useAutomationPlatformServices() {
  const { user, profile, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const { services: aiWorkflowServices } = useAIWorkflowPlatformServices();

  const services = useMemo(
    () => {
      const bridge = aiWorkflowServices.createRuntimeBridge((automationContext) => ({
        userId: user?.id ?? null,
        companyId: profile?.company_id ?? automationContext.company.id,
        isSuperAdmin,
        hasPermission,
      }));
      return createAutomationPlatformServices(supabase, {
        registry: createAutomationRegistryWithAIWorkflow(bridge),
      });
    },
    [aiWorkflowServices, user?.id, profile?.company_id, isSuperAdmin, hasPermission],
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

  return { services, context };
}
