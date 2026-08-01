import { usePromptOrchestratorServices } from "@/lib/ai-prompt-orchestrator";
import type { ServiceContext } from "@workspace/ai-execution-engine";
import { createAIExecutionServices } from "@workspace/ai-execution-engine";
import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { useAIProviderServices } from "@/lib/ai-provider-layer";
import { useRetrievalServices } from "@/lib/retrieval-engine";
import { useToolRouterServices } from "@/lib/ai-tool-router";
import { supabase } from "@/lib/supabase";
import { createEnterpriseRuntimeIntegrations } from "@/lib/runtime-integration/runtime-adapters";
import { createRuntimeToolPort } from "@/lib/runtime-integration/tool-port-adapter";
import { createScopedRuntimeToolPort } from "@/lib/ai-employees/utilities/scoped-runtime-tool-port";
import { createPlatformRuntimeConfigPort } from "@/lib/platform-ai-provider/platform-runtime-port";
import { createPlatformAIProviderServices } from "@workspace/platform-ai-provider";

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
  const { services: toolRouterServices, createOptions } = useToolRouterServices();

  const tools = useMemo(
    () => createScopedRuntimeToolPort(createRuntimeToolPort(toolRouterServices, createOptions)),
    [toolRouterServices, createOptions],
  );
  const platformServices = useMemo(() => createPlatformAIProviderServices(supabase), []);
  const platformConfig = useMemo(
    () =>
      createPlatformRuntimeConfigPort(async ({ companyId, providerKey, useCase }) => {
        const runtime = await platformServices.platform.resolveRuntimeConfig(companyId, providerKey, useCase);
        return {
          apiKey: runtime.apiKey,
          model: runtime.model,
          baseUrl: runtime.baseUrl,
          providerKey: runtime.providerKey,
          usesPlatformKey: runtime.usesPlatformKey,
        };
      }),
    [platformServices],
  );

  const services = useMemo(
    () =>
      createAIExecutionServices(
        supabase,
        createEnterpriseRuntimeIntegrations({
          promptRuntime: promptServices.runtime,
          gateway: providerServices.gateway,
          knowledge: retrievalServices.knowledge,
          tools,
          platformConfig,
        }),
      ),
    [promptServices.runtime, providerServices.gateway, retrievalServices.knowledge, tools, platformConfig],
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
