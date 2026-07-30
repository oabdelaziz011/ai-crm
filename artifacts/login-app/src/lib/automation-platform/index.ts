import { useMemo } from "react";
import type { ServiceContext } from "@workspace/automation-platform";
import { createAutomationPlatformServices } from "@workspace/automation-platform";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import {
  useAiChatFeatureEnabled,
  useEmbeddingsFeatureEnabled,
  useKnowledgeFeatureEnabled,
  useToolCallingFeatureEnabled,
  useWorkflowFeatureEnabled,
} from "@/hooks/platform-ai/use-platform-ai-feature-enabled";
import { createAutomationRegistryWithAIWorkflow } from "@/lib/ai-workflow-platform/automation-registry";
import { useAIWorkflowPlatformServices } from "@/lib/ai-workflow-platform";
import { useToolRouterServices } from "@/lib/ai-tool-router";
import { createRuntimeToolPort } from "@/lib/runtime-integration/tool-port-adapter";
import { createSchedulingAwareBookingServicePort } from "@/lib/booking/automation-booking-adapter";
import { createSupabaseCustomerServicePort } from "@/lib/crm/supabase-customer-service-adapter";
import { createLookupOptionsPort } from "@/lib/lookups/create-lookup-options-port";
import { createBusinessCalendarPort } from "@/lib/scheduling/business-calendar/create-business-calendar-port";
import { supabase } from "@/lib/supabase";

/**
 * Factory hook for Automation Platform services with AI workflow execution wired
 * into the AutomationEngine action handler registry.
 */
export function useAutomationPlatformServices() {
  const { user, profile, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const { services: aiWorkflowServices } = useAIWorkflowPlatformServices();
  const { isEnabled: workflowFeatureEnabled } = useWorkflowFeatureEnabled();
  const { isEnabled: aiChatEnabled } = useAiChatFeatureEnabled();
  const { isEnabled: toolCallingEnabled } = useToolCallingFeatureEnabled();
  const { isEnabled: knowledgeEnabled } = useKnowledgeFeatureEnabled();
  const { isEnabled: embeddingsEnabled } = useEmbeddingsFeatureEnabled();
  const { services: toolRouterServices, createOptions } = useToolRouterServices();
  const tools = useMemo(
    () => createRuntimeToolPort(toolRouterServices, createOptions),
    [toolRouterServices, createOptions],
  );

  const services = useMemo(
    () => {
      const bridge = aiWorkflowServices.createRuntimeBridge((automationContext) => ({
        userId: user?.id ?? null,
        companyId: profile?.company_id ?? automationContext.company.id,
        isSuperAdmin,
        hasPermission,
        isWorkflowFeatureEnabled: () => workflowFeatureEnabled,
        isAiChatFeatureEnabled: () => aiChatEnabled,
        isToolCallingFeatureEnabled: () => toolCallingEnabled,
        isKnowledgeFeatureEnabled: () => knowledgeEnabled,
        isEmbeddingsFeatureEnabled: () => embeddingsEnabled,
        hasLlmTools: () => tools.listLlmTools().length > 0,
      }));
      const bookingService = createSchedulingAwareBookingServicePort(supabase, () => user?.id ?? null);
      const customerService = createSupabaseCustomerServicePort(supabase, () => user?.id ?? null);
      const lookupOptions = createLookupOptionsPort(supabase);
      const businessCalendar = createBusinessCalendarPort();
      return createAutomationPlatformServices(supabase, {
        registry: createAutomationRegistryWithAIWorkflow(bridge, {
          bookingService,
          customerService,
          lookupOptions,
          businessCalendar,
        }),
      });
    },
    [aiWorkflowServices, user?.id, profile?.company_id, isSuperAdmin, hasPermission, workflowFeatureEnabled, aiChatEnabled, toolCallingEnabled, knowledgeEnabled, embeddingsEnabled, tools],
  );

  const context = useMemo<ServiceContext>(
    () => ({
      userId: user?.id ?? null,
      companyId: profile?.company_id ?? null,
      isSuperAdmin,
      hasPermission,
      isWorkflowFeatureEnabled: () => workflowFeatureEnabled,
    }),
    [user?.id, profile?.company_id, isSuperAdmin, hasPermission, workflowFeatureEnabled],
  );

  return { services, context };
}
