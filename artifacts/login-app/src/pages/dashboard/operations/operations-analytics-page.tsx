import { useTranslation } from "react-i18next";
import { WorkspaceMetric, WorkspacePanel } from "@/components/customer-workspace/workspace-ui";

export function OperationsAnalyticsPage() {
  const { t } = useTranslation("common");

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">{t("universalOperations.analytics.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("universalOperations.analytics.subtitle")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <WorkspaceMetric label={t("universalOperations.analytics.todayOps")} value={47} />
        <WorkspaceMetric label={t("universalOperations.analytics.revenue")} value="$4,280" accent="success" />
        <WorkspaceMetric label={t("universalOperations.analytics.pendingPayments")} value={8} accent="warning" />
        <WorkspaceMetric label={t("universalOperations.analytics.upcoming")} value={23} />
        <WorkspaceMetric label={t("universalOperations.analytics.noShows")} value={3} />
        <WorkspaceMetric label={t("universalOperations.analytics.completionRate")} value="87%" accent="success" />
      </div>

      <WorkspacePanel title={t("universalOperations.analytics.avgServiceTime")}>
        <p className="font-mono text-3xl font-bold tabular-nums">32 min</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("universalOperations.analytics.mockNote")}</p>
      </WorkspacePanel>
    </div>
  );
}
