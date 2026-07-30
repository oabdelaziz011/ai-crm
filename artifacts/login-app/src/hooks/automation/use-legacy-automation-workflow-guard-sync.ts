import { useEffect } from "react";
import { useAuthUser } from "@/hooks/use-rbac";
import { useWorkflowFeatureEnabled } from "@/hooks/platform-ai/use-platform-ai-feature-enabled";
import { setLegacyAutomationWorkflowGuard } from "@/lib/automation/utils/workflow-guard";

/** Keeps legacy automation domain guards in sync with the tenant workflow feature flag. */
export function useLegacyAutomationWorkflowGuardSync(): void {
  const { isSuperAdmin } = useAuthUser();
  const { isEnabled } = useWorkflowFeatureEnabled();

  useEffect(() => {
    setLegacyAutomationWorkflowGuard({
      isSuperAdmin,
      isEnabled: () => isEnabled,
    });
    return () => setLegacyAutomationWorkflowGuard(null);
  }, [isEnabled, isSuperAdmin]);
}
