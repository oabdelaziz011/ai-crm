import { lazy, memo, Suspense, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  FileBarChart2,
  Gauge,
  GitBranch,
  Layers3,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard/ui";
import type { WorkflowAnalyticsController } from "../hooks/use-workflow-analytics";
import {
  mapFailureTrendToChartSeries,
  mapReadinessTrendToChartSeries,
  mapTrendPointsToChartSeries,
} from "../selectors/analytics-chart-selectors";

const AnalyticsTrendChart = lazy(() =>
  import("./analytics-trend-chart").then((module) => ({ default: module.AnalyticsTrendChart })),
);

type AnalyticsPanelProps = {
  analytics: WorkflowAnalyticsController;
  onFocusNode?: (nodeId: string) => void;
};

type AnalyticsTab = "dashboard" | "performance" | "trends" | "branches" | "triggers" | "failures" | "coverage" | "heatmap" | "kpis" | "report";

function healthBadgeVariant(health: string): "default" | "secondary" | "destructive" | "outline" {
  if (health === "healthy") return "default";
  if (health === "warning") return "secondary";
  if (health === "critical") return "destructive";
  return "outline";
}

export const AnalyticsPanel = memo(function AnalyticsPanel({ analytics, onFocusNode }: AnalyticsPanelProps) {
  const { t } = useTranslation("common");
  const [tab, setTab] = useState<AnalyticsTab>("dashboard");
  const { viewModel } = analytics;

  const successTrend = useMemo(() => mapTrendPointsToChartSeries(viewModel.trends), [viewModel.trends]);
  const failureTrend = useMemo(() => mapFailureTrendToChartSeries(viewModel.trends), [viewModel.trends]);
  const readinessTrend = useMemo(() => mapReadinessTrendToChartSeries(viewModel.trends), [viewModel.trends]);

  return (
    <DashboardCard className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{t("workflowBuilder.analytics.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("workflowBuilder.analytics.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            <ShieldCheck className="me-1 h-3.5 w-3.5" />
            {t("workflowBuilder.analytics.readOnlyBadge")}
          </Badge>
          <Badge variant={healthBadgeVariant(viewModel.dashboard.overallHealth)}>
            {t(`workflowBuilder.analytics.health.${viewModel.dashboard.overallHealth}`)}
          </Badge>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["dashboard", Gauge],
            ["performance", Zap],
            ["trends", Activity],
            ["branches", GitBranch],
            ["triggers", Layers3],
            ["failures", BarChart3],
            ["coverage", FileBarChart2],
            ["heatmap", Activity],
            ["kpis", Gauge],
            ["report", FileBarChart2],
          ] as const
        ).map(([key, Icon]) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={tab === key ? "default" : "outline"}
            className="rounded-xl"
            onClick={() => setTab(key)}
          >
            <Icon className="me-2 h-4 w-4" />
            {t(`workflowBuilder.analytics.tabs.${key}`)}
          </Button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "dashboard" ? (
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <MetricCard label={t("workflowBuilder.analytics.dashboard.executions")} value={String(viewModel.dashboard.executions)} />
            <MetricCard label={t("workflowBuilder.analytics.dashboard.successfulTests")} value={String(viewModel.dashboard.successfulTests)} />
            <MetricCard label={t("workflowBuilder.analytics.dashboard.failedTests")} value={String(viewModel.dashboard.failedTests)} />
            <MetricCard label={t("workflowBuilder.analytics.dashboard.averageDuration")} value={viewModel.dashboard.averageDurationMs != null ? `${viewModel.dashboard.averageDurationMs}ms` : "—"} />
            <MetricCard label={t("workflowBuilder.analytics.dashboard.readinessScore")} value={viewModel.dashboard.readinessScore != null ? String(viewModel.dashboard.readinessScore) : "—"} />
            <MetricCard label={t("workflowBuilder.analytics.dashboard.overallHealth")} value={t(`workflowBuilder.analytics.health.${viewModel.dashboard.overallHealth}`)} />
          </div>
        ) : null}

        {tab === "performance" ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard label={t("workflowBuilder.analytics.performance.fastest")} value={viewModel.performance.fastestExecutionMs != null ? `${viewModel.performance.fastestExecutionMs}ms` : "—"} />
            <MetricCard label={t("workflowBuilder.analytics.performance.slowest")} value={viewModel.performance.slowestExecutionMs != null ? `${viewModel.performance.slowestExecutionMs}ms` : "—"} />
            <MetricCard label={t("workflowBuilder.analytics.performance.average")} value={viewModel.performance.averageRuntimeMs != null ? `${viewModel.performance.averageRuntimeMs}ms` : "—"} />
            <MetricCard label={t("workflowBuilder.analytics.performance.nodeExecutions")} value={String(viewModel.performance.nodeExecutionCount)} />
            <MetricCard label={t("workflowBuilder.analytics.performance.branchExecutions")} value={String(viewModel.performance.branchExecutionCount)} />
          </div>
        ) : null}

        {tab === "trends" ? (
          <Suspense fallback={<p className="text-sm text-muted-foreground">{t("workflowBuilder.analytics.loading")}</p>}>
            <div className="grid gap-4 lg:grid-cols-3">
              <TrendBlock title={t("workflowBuilder.analytics.trends.success")} chartId="success" data={successTrend} />
              <TrendBlock title={t("workflowBuilder.analytics.trends.failures")} chartId="failures" data={failureTrend} />
              <TrendBlock title={t("workflowBuilder.analytics.trends.readiness")} chartId="readiness" data={readinessTrend} />
            </div>
          </Suspense>
        ) : null}

        {tab === "branches" ? (
          <div className="space-y-3 text-sm">
            <DetailRow label={t("workflowBuilder.analytics.branches.mostExecuted")} value={viewModel.branches.mostExecutedBranch ?? "—"} />
            <DetailRow label={t("workflowBuilder.analytics.branches.leastExecuted")} value={viewModel.branches.leastExecutedBranch ?? "—"} />
            <section>
              <h3 className="mb-1 font-semibold">{t("workflowBuilder.analytics.branches.neverExecuted")}</h3>
              {viewModel.branches.neverExecutedBranches.length === 0 ? (
                <p className="text-muted-foreground">{t("workflowBuilder.analytics.empty.branches")}</p>
              ) : (
                <ul className="list-disc ps-5 text-muted-foreground">
                  {viewModel.branches.neverExecutedBranches.map((branch) => (
                    <li key={branch}>{branch}</li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}

        {tab === "triggers" ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard label={t("workflowBuilder.analytics.triggers.type")} value={viewModel.triggers.triggerType ?? "—"} />
            <MetricCard label={t("workflowBuilder.analytics.triggers.executions")} value={String(viewModel.triggers.executions)} />
            <MetricCard label={t("workflowBuilder.analytics.triggers.failures")} value={String(viewModel.triggers.failures)} />
            <MetricCard label={t("workflowBuilder.analytics.triggers.successRate")} value={viewModel.triggers.successRate != null ? `${viewModel.triggers.successRate}%` : "—"} />
            <MetricCard label={t("workflowBuilder.analytics.triggers.averageLatency")} value={viewModel.triggers.averageLatencyMs != null ? `${viewModel.triggers.averageLatencyMs}ms` : "—"} />
          </div>
        ) : null}

        {tab === "failures" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <FailureList title={t("workflowBuilder.analytics.failures.assertions")} items={viewModel.failures.commonAssertionFailures} />
            <FailureList title={t("workflowBuilder.analytics.failures.warnings")} items={viewModel.failures.commonWarnings} />
            <section className="lg:col-span-2">
              <h3 className="mb-1 text-sm font-semibold">{t("workflowBuilder.analytics.failures.unstableNodes")}</h3>
              {viewModel.failures.unstableNodes.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("workflowBuilder.analytics.empty.unstableNodes")}</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {viewModel.failures.unstableNodes.map((node) => (
                    <li key={node.nodeId} className="flex items-center justify-between rounded-lg border border-border/60 px-2 py-1">
                      <span>{node.label} ({node.nodeId})</span>
                      <span className="text-muted-foreground">{node.failureCount}</span>
                      {onFocusNode ? (
                        <Button type="button" size="sm" variant="ghost" className="h-7 rounded-lg" onClick={() => onFocusNode(node.nodeId)}>
                          {t("workflowBuilder.analytics.actions.focusNode")}
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}

        {tab === "coverage" ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label={t("workflowBuilder.analytics.coverage.nodes")} value={`${viewModel.coverage.nodeCoveragePercent}%`} />
            <MetricCard label={t("workflowBuilder.analytics.coverage.branches")} value={`${viewModel.coverage.branchCoveragePercent}%`} />
            <MetricCard label={t("workflowBuilder.analytics.coverage.assertions")} value={`${viewModel.coverage.assertionCoveragePercent}%`} />
            <MetricCard label={t("workflowBuilder.analytics.coverage.triggers")} value={`${viewModel.coverage.triggerCoveragePercent}%`} />
          </div>
        ) : null}

        {tab === "heatmap" ? (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {viewModel.heatmap.map((entry) => (
              <li
                key={entry.nodeId}
                className={`rounded-xl border px-3 py-2 text-sm ${
                  entry.intensity === "hot"
                    ? "border-orange-500/40 bg-orange-500/10"
                    : entry.intensity === "warm"
                      ? "border-amber-500/30 bg-amber-500/10"
                      : "border-border/60 bg-background/70"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{entry.label}</span>
                  {entry.isBottleneck ? <Badge variant="destructive">{t("workflowBuilder.analytics.heatmap.bottleneck")}</Badge> : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("workflowBuilder.analytics.heatmap.executions", { count: entry.executionCount })}
                </p>
                {onFocusNode ? (
                  <Button type="button" size="sm" variant="ghost" className="mt-1 h-7 rounded-lg" onClick={() => onFocusNode(entry.nodeId)}>
                    {t("workflowBuilder.analytics.actions.focusNode")}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {tab === "kpis" ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard label={t("workflowBuilder.analytics.kpis.quality")} value={String(viewModel.kpis.workflowQuality)} />
            <MetricCard label={t("workflowBuilder.analytics.kpis.complexity")} value={String(viewModel.kpis.workflowComplexity)} />
            <MetricCard label={t("workflowBuilder.analytics.kpis.maintainability")} value={String(viewModel.kpis.maintainability)} />
            <MetricCard label={t("workflowBuilder.analytics.kpis.stability")} value={String(viewModel.kpis.stability)} />
            <MetricCard label={t("workflowBuilder.analytics.kpis.readiness")} value={String(viewModel.kpis.readiness)} />
          </div>
        ) : null}

        {tab === "report" ? (
          <div className="space-y-3 text-sm">
            {viewModel.report.recommendations.length > 0 ? (
              <section>
                <h3 className="mb-1 font-semibold">{t("workflowBuilder.analytics.report.recommendations")}</h3>
                <ul className="list-disc ps-5 text-muted-foreground">
                  {viewModel.report.recommendations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            {viewModel.report.bottlenecks.length > 0 ? (
              <section>
                <h3 className="mb-1 font-semibold">{t("workflowBuilder.analytics.report.bottlenecks")}</h3>
                <ul className="list-disc ps-5 text-muted-foreground">
                  {viewModel.report.bottlenecks.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            <p className="text-xs text-muted-foreground">{t("workflowBuilder.analytics.report.exportReady")}</p>
          </div>
        ) : null}
      </div>
    </DashboardCard>
  );
});

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/70 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function FailureList({ title, items }: { title: string; items: Array<{ message: string; count: number }> }) {
  const { t } = useTranslation("common");
  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("workflowBuilder.analytics.empty.failures")}</p>
      ) : (
        <ul className="space-y-1 text-sm text-muted-foreground">
          {items.map((item) => (
            <li key={item.message} className="rounded-lg border border-border/50 px-2 py-1">
              {item.message} ({item.count})
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TrendBlock({
  title,
  chartId,
  data,
}: {
  title: string;
  chartId: string;
  data: Array<{ label: string; value: number }>;
}) {
  const { t } = useTranslation("common");
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 p-3">
        <h3 className="mb-2 text-sm font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{t("workflowBuilder.analytics.empty.trends")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 p-3">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <AnalyticsTrendChart chartId={chartId} data={data} />
    </div>
  );
}
