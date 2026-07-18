import type { ServiceContext } from "@workspace/ai-prompt-orchestrator";
import { createPromptOrchestratorServices } from "@workspace/ai-prompt-orchestrator";
import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { supabase } from "@/lib/supabase";

/**
 * Factory hook for Prompt Orchestration domain services.
 * Business logic lives in @workspace/ai-prompt-orchestrator — not in UI.
 */
export function usePromptOrchestratorServices() {
  const { user, profile, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();

  const services = useMemo(() => createPromptOrchestratorServices(supabase), []);

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
