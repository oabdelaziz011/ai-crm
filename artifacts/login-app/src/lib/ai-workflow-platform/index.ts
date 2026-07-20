import { useMemo } from "react";
import { createAIWorkflowPlatformServices } from "@workspace/ai-workflow-platform";
import { useAIExecutionServices } from "@/lib/ai-execution-engine";
import { useRetrievalServices } from "@/lib/retrieval-engine";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { createAIWorkflowKnowledgePortAdapter } from "./knowledge-port-adapter";

export function useAIWorkflowPlatformServices() {
  const { user, profile, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const { services: executionServices } = useAIExecutionServices();
  const { services: retrievalServices } = useRetrievalServices();

  const services = useMemo(() => {
    const runtime = executionServices.enterpriseRuntime;
    if (!runtime) {
      throw new Error("Enterprise AI Runtime is required for AI workflow nodes.");
    }
    return createAIWorkflowPlatformServices({
      runtime,
      knowledge: createAIWorkflowKnowledgePortAdapter(retrievalServices.knowledge),
    });
  }, [executionServices.enterpriseRuntime, retrievalServices.knowledge]);

  const context = useMemo(
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
