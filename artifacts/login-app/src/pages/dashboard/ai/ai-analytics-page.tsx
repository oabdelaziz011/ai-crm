import { Activity, AlertTriangle, Clock, Layers } from "lucide-react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import AccessDeniedPage from "@/pages/access-denied";
import { useAuthUser } from "@/hooks/use-rbac";
import {
  DashboardCard,
  DashboardErrorBanner,
  DashboardStatCard,
  DashboardTableSkeleton,
} from "@/components/dashboard/ui";
import {
  useAiAnalyticsAggregate,
  useAiAnalyticsRecords,
  useAiTraces,
} from "@/hooks/ai-observability/use-ai-analytics";

export default function AiAnalyticsPage() {
  const { t } = useTranslation("common");
  const { isSuperAdmin, hasPermission } = useAuthUser();
  const canView = isSuperAdmin || hasPermission("ai.analytics.view");
  const { data: aggregate, isLoading, error } = useAiAnalyticsAggregate();
  const { data: records = [], isLoading: recordsLoading } = useAiAnalyticsRecords(30);
  const { data: traces = [], isLoading: tracesLoading } = useAiTraces(20);

  if (!canView) {
    return <AccessDeniedPage requiredPermission="ai.analytics.view" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("dashboard.aiAnalytics.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("dashboard.aiAnalytics.subtitle")}</p>
      </div>

      {error && <DashboardErrorBanner message={error.message} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardStatCard
          label={t("dashboard.aiAnalytics.stats.executions")}
          value={aggregate?.totalExecutions ?? "—"}
          icon={Activity}
          loading={isLoading}
        />
        <DashboardStatCard
          label={t("dashboard.aiAnalytics.stats.latency")}
          value={aggregate ? `${aggregate.averageLatencyMs} ms` : "—"}
          icon={Clock}
          loading={isLoading}
        />
        <DashboardStatCard
          label={t("dashboard.aiAnalytics.stats.timeouts")}
          value={aggregate?.timeoutCount ?? "—"}
          icon={AlertTriangle}
          loading={isLoading}
        />
        <DashboardStatCard
          label={t("dashboard.aiAnalytics.stats.tokens")}
          value={aggregate?.totalTokens?.toLocaleString() ?? "—"}
          icon={Layers}
          loading={isLoading}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <DashboardCard className="overflow-hidden">
          <div className="p-5 border-b border-white/5">
            <h3 className="font-semibold text-sm">{t("dashboard.aiAnalytics.recentExecutions")}</h3>
          </div>
          {recordsLoading ? (
            <DashboardTableSkeleton rows={4} />
          ) : (
            <div className="divide-y divide-white/5 max-h-80 overflow-y-auto">
              {records.map((record) => (
                <div key={record.id} className="px-5 py-3 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium capitalize">{record.provider_key}</span>
                    <span className="text-xs text-muted-foreground">{record.execution_status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {record.latency_ms} ms · {record.total_tokens} tokens · {record.currency}{" "}
                    {record.estimated_cost.toFixed(4)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </DashboardCard>

        <DashboardCard className="overflow-hidden">
          <div className="p-5 border-b border-white/5">
            <h3 className="font-semibold text-sm">{t("dashboard.aiAnalytics.recentTraces")}</h3>
          </div>
          {tracesLoading ? (
            <DashboardTableSkeleton rows={4} />
          ) : (
            <div className="divide-y divide-white/5 max-h-80 overflow-y-auto">
              {traces.map((trace) => (
                <div key={trace.id} className="px-5 py-3 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="font-mono text-xs truncate">{trace.correlation_id ?? trace.trace_id}</span>
                    <span className="text-xs capitalize">{trace.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(trace.started_at), "PPp")}
                    {trace.conversation_id ? ` · conv ${trace.conversation_id.slice(0, 8)}…` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </DashboardCard>
      </div>
    </div>
  );
}
