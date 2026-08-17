import type { ServiceContext } from "@workspace/ai-provider-layer";
import { createAIProviderServices } from "@workspace/ai-provider-layer";
import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { createBrowserSafeAIGateway } from "@/lib/platform-ai/browser-safe-ai-gateway";
import { supabase } from "@/lib/supabase";

/**
 * Factory hook for AI Provider Layer domain services.
 * Business logic lives in @workspace/ai-provider-layer — not in UI.
 * Platform-managed provider secrets are proxied via api-server (never in browser).
 */
export function useAIProviderServices() {
  const { user, profile, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();

  const services = useMemo(() => {
    const base = createAIProviderServices(supabase);
    return {
      ...base,
      gateway: createBrowserSafeAIGateway(base.gateway),
    };
  }, []);

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
