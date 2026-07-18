import type { ServiceContext } from "@workspace/knowledge-platform";
import { createKnowledgePlatformServices } from "@workspace/knowledge-platform";
import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { supabase } from "@/lib/supabase";

/**
 * Factory hook for Knowledge Platform domain services.
 * Business logic lives in @workspace/knowledge-platform — not in UI.
 */
export function useKnowledgePlatformServices() {
  const { user, profile, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();

  const services = useMemo(() => createKnowledgePlatformServices(supabase), []);

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
