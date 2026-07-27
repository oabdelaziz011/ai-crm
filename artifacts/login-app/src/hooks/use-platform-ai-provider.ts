import type { ServiceContext } from "@workspace/platform-ai-provider";
import { createPlatformAIProviderServices } from "@workspace/platform-ai-provider";
import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { supabase } from "@/lib/supabase";

export function usePlatformAIProviderServices() {
  const { user, profile, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const services = useMemo(() => createPlatformAIProviderServices(supabase), []);

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
