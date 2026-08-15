import { useEffect } from "react";
import { useCommercialFeatureLookup } from "@/hooks/billing/use-commercial-feature-lookup";
import { useAuthUser } from "@/hooks/use-rbac";
import { useWorkflowFeatureEnabled } from "@/hooks/platform-ai/use-platform-ai-feature-enabled";
import { setLegacyAutomationWorkflowGuard } from "@/lib/automation/utils/workflow-guard";

/** Keeps legacy automation domain guards in sync with kill-switch + commercial entitlement. */
export function useLegacyAutomationWorkflowGuardSync(): void {
  const { isSuperAdmin } = useAuthUser();
  const { isEnabled } = useWorkflowFeatureEnabled();
  const { lookup } = useCommercialFeatureLookup();

  useEffect(() => {
    setLegacyAutomationWorkflowGuard({
      isSuperAdmin,
      isEnabled: () => isEnabled && lookup("workflow_automation") === true,
    });
    return () => setLegacyAutomationWorkflowGuard(null);
  }, [isEnabled, isSuperAdmin, lookup]);
}
