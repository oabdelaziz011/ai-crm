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
import { assertPlatformAiApiConfigured } from "@/lib/platform-ai/platform-ai-api-client";

/**
 * Factory hook for AI Execution Engine domain services.
 * Business logic lives in @workspace/ai-execution-engine — not in UI.
 * Platform API keys are never resolved in the browser — gateway proxy uses api-server.
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
  const platformConfig = useMemo(
    () =>
      createPlatformRuntimeConfigPort(async ({ providerKey }) => {
        // Do not call platform_resolve_ai_runtime_config from the browser.
        // Credentials are resolved on api-server when the gateway proxy runs.
        assertPlatformAiApiConfigured();
        return {
          providerKey,
          usesPlatformKey: true,
          __platformApiProxy: true,
        };
      }),
    [],
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
