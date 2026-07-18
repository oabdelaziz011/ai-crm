import type { ServiceContext } from "@workspace/vector-store";
import { createVectorStoreServices } from "@workspace/vector-store";
import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { supabase } from "@/lib/supabase";

/**
 * Factory hook for Vector Store domain services.
 * Business logic lives in @workspace/vector-store — not in UI.
 */
export function useVectorStoreServices() {
  const { user, profile, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();

  const services = useMemo(() => createVectorStoreServices(supabase), []);

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
