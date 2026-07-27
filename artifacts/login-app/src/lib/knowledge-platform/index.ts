import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { supabase } from "@/lib/supabase";
import type { ServiceContext } from "@workspace/knowledge-platform";

const knowledgePlatformModuleKey = ["knowledge-platform-module"] as const;

async function loadKnowledgePlatformModule() {
  const [knowledgePlatform, embeddingPlatform] = await Promise.all([
    import("@workspace/knowledge-platform"),
    import("@workspace/embedding-platform"),
  ]);
  return { knowledgePlatform, embeddingPlatform };
}

/**
 * Factory hook for Knowledge Platform domain services.
 * Business logic lives in @workspace/knowledge-platform — not in UI.
 */
export function useKnowledgePlatformServices() {
  const { user, profile, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const moduleQuery = useQuery({
    queryKey: knowledgePlatformModuleKey,
    queryFn: loadKnowledgePlatformModule,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });

  const services = useMemo(() => {
    if (!moduleQuery.data) return null;
    const embedding = moduleQuery.data.embeddingPlatform.createEmbeddingPlatformServices(supabase);
    return moduleQuery.data.knowledgePlatform.createKnowledgePlatformServices(supabase, {
      embeddingQueue: embedding.queue,
    });
  }, [moduleQuery.data]);

  const context = useMemo<ServiceContext>(
    () => ({
      userId: user?.id ?? null,
      companyId: profile?.company_id ?? null,
      isSuperAdmin,
      hasPermission,
    }),
    [user?.id, profile?.company_id, isSuperAdmin, hasPermission],
  );

  return { services, context, isLoading: moduleQuery.isLoading };
}
