import { useWorkflowFeatureEnabled } from "@/hooks/platform-ai/use-platform-ai-feature-enabled";
import { areWorkflowAiNodesEnabled } from "@/lib/platform-ai/workflow-access";
import { useAuthUser } from "@/hooks/use-rbac";

export function useWorkflowAiNodesEnabled(): boolean {
  const { isSuperAdmin } = useAuthUser();
  const { resolvedEnabled: workflowFeatureEnabled } = useWorkflowFeatureEnabled();
  if (isSuperAdmin) {
    return true;
  }
  return areWorkflowAiNodesEnabled(workflowFeatureEnabled);
}
