import type { ServiceContext } from "@workspace/ai-observability";
import { createAIObservabilityServices } from "@workspace/ai-observability";
import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { useAnalyticsFeatureEnabled } from "@/hooks/platform-ai/use-platform-ai-feature-enabled";
import { supabase } from "@/lib/supabase";

/**
 * Factory hook for AI Observability domain services.
 * Business logic lives in @workspace/ai-observability — not in UI.
 */
export function useAIObservabilityServices() {
  const { user, profile, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const { isEnabled: analyticsFeatureEnabled } = useAnalyticsFeatureEnabled();

  const services = useMemo(() => createAIObservabilityServices(supabase), []);

  const context = useMemo<ServiceContext>(
    () => ({
      userId: user?.id ?? null,
      companyId: profile?.company_id ?? null,
      isSuperAdmin,
      hasPermission,
      isAnalyticsFeatureEnabled: () => analyticsFeatureEnabled,
    }),
    [user?.id, profile?.company_id, isSuperAdmin, hasPermission, analyticsFeatureEnabled],
  );

  return { services, context };
}
