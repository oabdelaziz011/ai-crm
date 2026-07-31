import { Rocket } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DashboardCard } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import type { AiEmployeeDeploymentRecord } from "@/lib/ai-employees/types";

type DeploymentHistoryPanelProps = {
  deployments: AiEmployeeDeploymentRecord[];
};

export function DeploymentHistoryPanel({ deployments }: DeploymentHistoryPanelProps) {
  const { t } = useTranslation("common");

  return (
    <DashboardCard className="space-y-4 p-5">
      <div className="flex items-center gap-2">
        <Rocket className="size-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("aiEmployees.lifecycle.deployments.title")}
        </h2>
      </div>

      {deployments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("aiEmployees.lifecycle.deployments.empty")}</p>
      ) : (
        <div className="space-y-3">
          {deployments.map((deployment) => (
            <div key={deployment.id} className="rounded-2xl border border-border/60 bg-background/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {t("aiEmployees.lifecycle.deployments.version", { number: deployment.versionNumber })}
                </p>
                <Badge variant="outline">
                  {t(`aiEmployees.lifecycle.deploymentStatus.${deployment.status}`)}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {deployment.publishNotes || t("aiEmployees.lifecycle.deployments.noNotes")}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {new Date(deployment.publishedAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </DashboardCard>
  );
}
