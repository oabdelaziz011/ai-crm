import type { ServiceContext } from "@workspace/runtime-integration";
import { createRuntimeIntegrationServices } from "@workspace/runtime-integration";
import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { useAIObservabilityServices } from "@/lib/ai-observability";
import { useConversationServices } from "@/lib/ai-conversation";
import { useAIExecutionServices } from "@/lib/ai-execution-engine";
import { useIntentEngineServices } from "@/lib/ai-intent-engine";
import { useAIProviderServices } from "@/lib/ai-provider-layer";
import { usePromptOrchestratorServices } from "@/lib/ai-prompt-orchestrator";
import { useRetrievalServices } from "@/lib/retrieval-engine";
import { useVectorQueryServices } from "@/lib/vector-query";
import { supabase } from "@/lib/supabase";
import { createRuntimeEnginePortsWithContext } from "./engine-ports";
import { createRuntimeObservabilityPort } from "./observability-adapter";
import { createDashboardRuntimeEnginePortOptions } from "./runtime-port-options";

/**
 * Factory hook for Runtime Integration domain services.
 * Business logic lives in @workspace/runtime-integration — not in UI.
 */
export function useRuntimeIntegrationServices() {
  const { user, profile, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const { services: observabilityServices } = useAIObservabilityServices();
  const { services: conversationServices } = useConversationServices();
  const { services: intentServices } = useIntentEngineServices();
  const { services: vectorQueryServices } = useVectorQueryServices();
  const { services: retrievalServices } = useRetrievalServices();
  const { services: promptServices } = usePromptOrchestratorServices();
  const { services: executionServices } = useAIExecutionServices();
  const { services: providerServices } = useAIProviderServices();

  const context = useMemo<ServiceContext>(
    () => ({
      userId: user?.id ?? null,
      companyId: profile?.company_id ?? null,
      isSuperAdmin,
      hasPermission,
    }),
    [user?.id, profile?.company_id, isSuperAdmin, hasPermission],
  );

  const ports = useMemo(
    () =>
      createRuntimeEnginePortsWithContext(
        {
          conversation: conversationServices,
          intent: intentServices,
          vectorQuery: vectorQueryServices,
          retrieval: retrievalServices,
          prompt: promptServices,
          execution: executionServices,
          provider: providerServices,
        },
        context,
        createDashboardRuntimeEnginePortOptions(supabase, retrievalServices, async (companyId) => {
          if (context.userId && context.companyId === companyId) {
            return context.userId;
          }
          return null;
        }),
      ),
    [
      context,
      conversationServices,
      intentServices,
      vectorQueryServices,
      retrievalServices,
      promptServices,
      executionServices,
      providerServices,
    ],
  );

  const services = useMemo(
    () =>
      createRuntimeIntegrationServices(supabase, {
        ports,
        telemetry: createRuntimeObservabilityPort(
          {
            trace: observabilityServices.trace,
            analytics: observabilityServices.analytics,
          },
          context,
        ),
      }),
    [context, observabilityServices.trace, observabilityServices.analytics, ports],
  );

  return { services, context };
}
