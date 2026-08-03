import { useTranslation } from "react-i18next";
import { useLeadDashboardMetrics } from "@/hooks/leads/use-leads-workspace";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { WorkspaceMetric } from "@/components/customer-workspace/workspace-ui";
import { translateLeadLifecycleStatus } from "@/lib/i18n/workspace-mock-labels";

export function LeadsDashboardPage() {
  const { t } = useTranslation("common");
  const { data: metrics, isLoading } = useLeadDashboardMetrics();

  if (isLoading) return <DashboardPageFallback />;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">{t("leads.dashboard.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("leads.dashboard.subtitle")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <WorkspaceMetric label={t("leads.kpi.total")} value={metrics?.totalLeads ?? 0} compact />
        <WorkspaceMetric
          label={t("leads.kpi.conversionRate")}
          value={`${Math.round((metrics?.conversionRate ?? 0) * 100)}%`}
          compact
          accent="success"
        />
        <WorkspaceMetric label={t("leads.kpi.created")} value={metrics?.createdInPeriod ?? 0} compact />
        <WorkspaceMetric label={t("leads.kpi.converted")} value={metrics?.conversionsInPeriod ?? 0} compact />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-border/60 p-4">
          <h3 className="font-medium">{t("leads.dashboard.forecast")}</h3>
          <p className="mt-2 text-3xl font-bold">{(metrics?.forecastValue ?? 0).toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-border/60 p-4">
          <h3 className="font-medium">{t("leads.dashboard.byStatus")}</h3>
          <div className="mt-3 space-y-2">
            {Object.entries(metrics?.leadsByStatus ?? {}).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between text-sm capitalize">
                <span>{translateLeadLifecycleStatus(t, status)}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 p-4">
        <h3 className="font-medium">{t("leads.dashboard.pipelines")}</h3>
        <div className="mt-3 space-y-2">
          {(metrics?.pipelineMetrics ?? []).map((pipeline) => (
            <div key={pipeline.pipelineId} className="flex items-center justify-between text-sm">
              <span>{pipeline.pipelineName}</span>
              <span>
                {t("leads.dashboard.pipelineRow", {
                  count: pipeline.leadCount,
                  value: pipeline.pipelineValue.toLocaleString(),
                })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
