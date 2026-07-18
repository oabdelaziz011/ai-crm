import type { ServiceContext } from "@workspace/vector-query";
import { createVectorQueryServices } from "@workspace/vector-query";
import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { useAIObservabilityServices } from "@/lib/ai-observability";
import { supabase } from "@/lib/supabase";
import { createVectorQueryObservabilityPort } from "./observability-adapter";

/**
 * Factory hook for Vector Query domain services.
 * Business logic lives in @workspace/vector-query — not in UI.
 */
export function useVectorQueryServices() {
  const { user, profile, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const { services: observabilityServices } = useAIObservabilityServices();

  const context = useMemo<ServiceContext>(
    () => ({
      userId: user?.id ?? null,
      companyId: profile?.company_id ?? null,
      isSuperAdmin,
      hasPermission,
    }),
    [user?.id, profile?.company_id, isSuperAdmin, hasPermission],
  );

  const services = useMemo(
    () =>
      createVectorQueryServices(supabase, {
        telemetry: createVectorQueryObservabilityPort(observabilityServices.trace, context),
      }),
    [context, observabilityServices.trace],
  );

  return { services, context };
}
