import type { ServiceContext } from "@workspace/channel-registry";
import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { supabase } from "@/lib/supabase";
import { createChannelRegistryServices } from "@workspace/channel-registry";

/**
 * Factory hook for Channel Registry domain services.
 * Business logic lives in @workspace/channel-registry — not in UI.
 */
export function useChannelRegistryServices() {
  const { user, profile, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();

  const services = useMemo(() => createChannelRegistryServices(supabase), []);

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
