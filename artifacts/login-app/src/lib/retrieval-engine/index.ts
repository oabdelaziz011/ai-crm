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
      }),
    [embeddingServices.registry, embeddingServices.factory, vectorQueryServices.management],
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
