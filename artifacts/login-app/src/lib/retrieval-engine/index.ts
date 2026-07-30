import type { ServiceContext } from "@workspace/retrieval-engine";
import { createRetrievalServices } from "@workspace/retrieval-engine";
import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { useAIObservabilityServices } from "@/lib/ai-observability";
import { useEmbeddingPlatformServices } from "@/lib/embedding-platform";
import { useVectorQueryServices } from "@/lib/vector-query";
import { supabase } from "@/lib/supabase";
import { createRetrievalObservabilityPort } from "./observability-adapter";
import { createRetrievalPlatformPorts } from "./platform-adapters";
import { createPlatformAIProviderServices, PLATFORM_AI_FEATURE_KEY } from "@workspace/platform-ai-provider";

/**
 * Factory hook for Retrieval Engine domain services.
 * Business logic lives in @workspace/retrieval-engine — not in UI.
 */
export function useRetrievalServices() {
  const { user, profile, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const { services: observabilityServices } = useAIObservabilityServices();
  const { services: embeddingServices } = useEmbeddingPlatformServices();
  const { services: vectorQueryServices } = useVectorQueryServices();
  const platformServices = useMemo(() => createPlatformAIProviderServices(supabase), []);

  const context = useMemo<ServiceContext>(
    () => ({
      userId: user?.id ?? null,
      companyId: profile?.company_id ?? null,
      isSuperAdmin,
      hasPermission,
    }),
    [user?.id, profile?.company_id, isSuperAdmin, hasPermission],
  );

  const platformPorts = useMemo(
    () =>
      createRetrievalPlatformPorts({
        embedding: {
          registry: embeddingServices.registry,
          factory: embeddingServices.factory,
        },
        vectorQuery: {
          management: vectorQueryServices.management,
        },
        resolvePlatformConfiguration: async ({ companyId, providerKey }) => {
          const runtime = await platformServices.platform.resolveRuntimeConfig(
            companyId,
            providerKey,
            PLATFORM_AI_FEATURE_KEY.EMBEDDINGS,
          );
          return {
            apiKey: runtime.apiKey,
            model: runtime.model,
            baseUrl: runtime.baseUrl,
          };
        },
      }),
    [embeddingServices.registry, embeddingServices.factory, vectorQueryServices.management, platformServices],
  );

  const services = useMemo(
    () =>
      createRetrievalServices(supabase, {
        telemetry: createRetrievalObservabilityPort(observabilityServices.trace, context),
        queryEmbeddingPort: platformPorts.queryEmbeddingPort,
        vectorQueryPort: platformPorts.vectorQueryPort,
      }),
    [context, observabilityServices.trace, platformPorts],
  );

  return { services, context };
}
