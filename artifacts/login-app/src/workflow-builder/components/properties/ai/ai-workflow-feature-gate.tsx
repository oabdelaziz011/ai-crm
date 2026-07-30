import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuthUser } from "@/hooks/use-rbac";
import { areWorkflowAiNodesEnabled } from "@/lib/platform-ai/workflow-access";
import { useWorkflowFeatureEnabled } from "@/hooks/platform-ai/use-platform-ai-feature-enabled";

type AIWorkflowFeatureGateProps = {
  children: ReactNode;
};

export function AIWorkflowFeatureGate({ children }: AIWorkflowFeatureGateProps) {
  const { t } = useTranslation("common");
  const { isSuperAdmin } = useAuthUser();
  const { resolvedEnabled: workflowFeatureEnabled } = useWorkflowFeatureEnabled();

  if (isSuperAdmin || areWorkflowAiNodesEnabled(workflowFeatureEnabled)) {
    return <>{children}</>;
  }

  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-muted/30 p-4">
      <p className="text-sm text-muted-foreground">{t("automation.aiNodesDisabled")}</p>
    </div>
  );
}
