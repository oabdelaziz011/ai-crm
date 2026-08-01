import { memo, useMemo, useState } from "react";
import {
  AlertTriangle,
  Brain,
  FileBarChart2,
  Gauge,
  GitBranch,
  Layers3,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard/ui";
import type { WorkflowOptimizationController } from "../hooks/use-workflow-optimization";
import type { OptimizationRecommendation } from "../types/optimization-types";
import { groupRecommendationsByCategory } from "../selectors/optimization-ui-selectors";

type OptimizationPanelProps = {
  optimization: WorkflowOptimizationController;
  onFocusNode?: (nodeId: string) => void;
};

type OptimizationTab =
  | "dashboard"
  | "performance"
  | "structure"
  | "ai"
  | "trigger"
  | "reliability"
  | "complexity"
  | "report";

function healthBadgeVariant(health: string): "default" | "secondary" | "destructive" | "outline" {
  if (health === "healthy") return "default";
  if (health === "warning") return "secondary";
  if (health === "critical") return "destructive";
  return "outline";
}

function severityBadgeVariant(severity: OptimizationRecommendation["severity"]): "default" | "secondary" | "destructive" | "outline" {
  if (severity === "critical") return "destructive";
  if (severity === "warning") return "secondary";
  return "outline";
}

export const OptimizationPanel = memo(function OptimizationPanel({
  optimization,
  onFocusNode,
}: OptimizationPanelProps) {
  const { t } = useTranslation("common");
  const [tab, setTab] = useState<OptimizationTab>("dashboard");
  const { viewModel } = optimization;
  const grouped = useMemo(() => groupRecommendationsByCategory(viewModel.recommendations), [viewModel.recommendations]);

  return (
    <DashboardCard className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{t("workflowBuilder.optimization.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("workflowBuilder.optimization.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            <ShieldCheck className="me-1 h-3.5 w-3.5" />
            {t("workflowBuilder.optimization.advisoryBadge")}
          </Badge>
          <Badge variant={healthBadgeVariant(viewModel.dashboard.overallHealth)}>
            {t(`workflowBuilder.optimization.health.${viewModel.dashboard.overallHealth}`)}
          </Badge>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["dashboard", Gauge],
            ["performance", Zap],
            ["structure", GitBranch],
            ["ai", Brain],
            ["trigger", Layers3],
            ["reliability", AlertTriangle],
            ["complexity", Sparkles],
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
            {t(`workflowBuilder.optimization.tabs.${key}`)}
          </Button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "dashboard" ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard label={t("workflowBuilder.optimization.dashboard.score")} value={String(viewModel.dashboard.optimizationScore)} />
            <MetricCard label={t("workflowBuilder.optimization.dashboard.health")} value={t(`workflowBuilder.optimization.health.${viewModel.dashboard.overallHealth}`)} />
            <MetricCard label={t("workflowBuilder.optimization.dashboard.impact")} value={`${viewModel.dashboard.estimatedImpact}%`} />
            <MetricCard label={t("workflowBuilder.optimization.dashboard.recommendations")} value={String(viewModel.dashboard.recommendationCount)} />
            <MetricCard label={t("workflowBuilder.optimization.dashboard.critical")} value={String(viewModel.dashboard.criticalCount)} />
          </div>
        ) : null}

        {tab === "performance" ? (
          <RecommendationList
            items={grouped.performance}
            emptyLabel={t("workflowBuilder.optimization.empty.performance")}
            onFocusNode={onFocusNode}
            t={t}
          />
        ) : null}

        {tab === "structure" ? (
          <RecommendationList
            items={grouped.structure}
            emptyLabel={t("workflowBuilder.optimization.empty.structure")}
            onFocusNode={onFocusNode}
            t={t}
          />
        ) : null}

        {tab === "ai" ? (
          <RecommendationList
            items={grouped.ai}
            emptyLabel={t("workflowBuilder.optimization.empty.ai")}
            onFocusNode={onFocusNode}
            t={t}
          />
        ) : null}

        {tab === "trigger" ? (
          <RecommendationList
            items={grouped.trigger}
            emptyLabel={t("workflowBuilder.optimization.empty.trigger")}
            onFocusNode={onFocusNode}
            t={t}
          />
        ) : null}

        {tab === "reliability" ? (
          <RecommendationList
            items={grouped.reliability}
            emptyLabel={t("workflowBuilder.optimization.empty.reliability")}
            onFocusNode={onFocusNode}
            t={t}
          />
        ) : null}

        {tab === "complexity" ? (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label={t("workflowBuilder.optimization.complexity.graph")} value={String(viewModel.complexity.graphComplexity)} />
              <MetricCard label={t("workflowBuilder.optimization.complexity.branching")} value={String(viewModel.complexity.branchingComplexity)} />
              <MetricCard label={t("workflowBuilder.optimization.complexity.maintainability")} value={String(viewModel.complexity.maintainability)} />
              <MetricCard label={t("workflowBuilder.optimization.complexity.readability")} value={String(viewModel.complexity.readability)} />
            </div>
            <RecommendationList
              items={grouped.complexity}
              emptyLabel={t("workflowBuilder.optimization.empty.complexity")}
              onFocusNode={onFocusNode}
              t={t}
            />
          </div>
        ) : null}

        {tab === "report" ? (
          <div className="space-y-4">
            <section>
              <h3 className="mb-2 text-sm font-medium">{t("workflowBuilder.optimization.report.summary")}</h3>
              <p className="text-sm text-muted-foreground">{viewModel.report.executiveSummary || t("workflowBuilder.optimization.report.noSummary")}</p>
            </section>
            <section>
              <h3 className="mb-2 text-sm font-medium">{t("workflowBuilder.optimization.report.risks")}</h3>
              {viewModel.report.risks.length > 0 ? (
                <ul className="list-inside list-disc text-sm text-muted-foreground">
                  {viewModel.report.risks.map((risk: string) => (
                    <li key={risk}>{risk}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("workflowBuilder.optimization.report.noRisks")}</p>
              )}
            </section>
            <section>
              <h3 className="mb-2 text-sm font-medium">{t("workflowBuilder.optimization.report.opportunities")}</h3>
              {viewModel.report.opportunities.length > 0 ? (
                <ul className="list-inside list-disc text-sm text-muted-foreground">
                  {viewModel.report.opportunities.map((item: string) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("workflowBuilder.optimization.report.noOpportunities")}</p>
              )}
            </section>
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

function RecommendationList({
  items,
  emptyLabel,
  onFocusNode,
  t,
}: {
  items: readonly OptimizationRecommendation[];
  emptyLabel: string;
  onFocusNode?: (nodeId: string) => void;
  t: (key: string) => string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="rounded-xl border border-border/60 bg-background/70 p-3">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant={severityBadgeVariant(item.severity)}>{t(`workflowBuilder.optimization.severity.${item.severity}`)}</Badge>
            <span className="text-sm font-medium">{item.title}</span>
          </div>
          <p className="text-sm text-muted-foreground">{item.description}</p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>{t("workflowBuilder.optimization.recommendation.impact")}: {item.impact}%</span>
            <span>{t("workflowBuilder.optimization.recommendation.confidence")}: {item.confidence}%</span>
            <span>{item.estimatedBenefit}</span>
          </div>
          {item.affectedNodeIds.length > 0 && onFocusNode ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {item.affectedNodeIds.map((nodeId) => (
                <Button key={nodeId} type="button" size="sm" variant="outline" className="rounded-lg" onClick={() => onFocusNode(nodeId)}>
                  {t("workflowBuilder.optimization.actions.focusNode")}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
