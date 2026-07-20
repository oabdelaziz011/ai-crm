import { usePromptOrchestratorServices } from "@/lib/ai-prompt-orchestrator";
import type { ServiceContext } from "@workspace/ai-execution-engine";
import { createAIExecutionServices } from "@workspace/ai-execution-engine";
import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { useAIProviderServices } from "@/lib/ai-provider-layer";
import { useRetrievalServices } from "@/lib/retrieval-engine";
import { supabase } from "@/lib/supabase";
import { createEnterpriseRuntimeIntegrations } from "@/lib/runtime-integration/runtime-adapters";

/**
 * Factory hook for AI Execution Engine domain services.
 * Business logic lives in @workspace/ai-execution-engine — not in UI.
 */
export function useAIExecutionServices() {
  const { user, profile, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const { services: promptServices } = usePromptOrchestratorServices();
  const { services: providerServices } = useAIProviderServices();
  const { services: retrievalServices } = useRetrievalServices();

  const services = useMemo(
    () =>
      createAIExecutionServices(
        supabase,
        createEnterpriseRuntimeIntegrations({
          promptRuntime: promptServices.runtime,
          gateway: providerServices.gateway,
          knowledge: retrievalServices.knowledge,
        }),
      ),
    [promptServices.runtime, providerServices.gateway, retrievalServices.knowledge],
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
