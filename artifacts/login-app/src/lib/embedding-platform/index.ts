import type { ServiceContext } from "@workspace/embedding-platform";
import { createEmbeddingPlatformServices } from "@workspace/embedding-platform";
import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { supabase } from "@/lib/supabase";

/**
 * Factory hook for Embedding Platform domain services.
 * Business logic lives in @workspace/embedding-platform — not in UI.
 */
export function useEmbeddingPlatformServices() {
  const { user, profile, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();

  const services = useMemo(() => createEmbeddingPlatformServices(supabase), []);

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
