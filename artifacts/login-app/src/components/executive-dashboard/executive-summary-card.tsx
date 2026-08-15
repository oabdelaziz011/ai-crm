import { memo } from "react";
import { Lightbulb } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DashboardCard } from "@/components/dashboard/ui";
import { cn } from "@/lib/utils";
import type {
  ExecutiveInsightModel,
  ExecutiveRecommendedActionModel,
  ExecutiveSummaryViewModel,
} from "@/lib/dashboard";

type ExecutiveSummaryCardProps = {
  title: string;
  subtitle: string;
  insights: ExecutiveInsightModel[];
  executiveSummary: ExecutiveSummaryViewModel | null;
  resolveHealthLabel: (healthKey: string) => string;
  resolveHealthStatus?: (health: string) => string;
  winsLabel: string;
  risksLabel: string;
  immediateActionsLabel: string;
  longTermLabel: string;
  aiPreparedLabel: string;
  onActionNavigate?: (action: ExecutiveRecommendedActionModel) => void;
};

export const ExecutiveSummaryCard = memo(function ExecutiveSummaryCard({
  title,
  subtitle,
  insights,
  executiveSummary,
  resolveHealthLabel,
  resolveHealthStatus,
  winsLabel,
  risksLabel,
  immediateActionsLabel,
  longTermLabel,
  aiPreparedLabel,
  onActionNavigate,
}: ExecutiveSummaryCardProps) {
  return (
    <DashboardCard className="flex h-full flex-col p-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Lightbulb className="size-4 text-primary" aria-hidden />
            {title}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <Badge variant="secondary" className="shrink-0 text-[10px] uppercase tracking-wide">
          {aiPreparedLabel}
        </Badge>
      </header>

      {executiveSummary ? (
        <div className="mb-4 space-y-3 rounded-lg border bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {resolveHealthLabel(executiveSummary.healthKey)}
            </p>
            <Badge
              variant="outline"
              className={cn(
                executiveSummary.health === "excellent" && "border-emerald-500/40 text-emerald-600",
                executiveSummary.health === "good" && "border-sky-500/40 text-sky-600",
                executiveSummary.health === "fair" && "border-amber-500/40 text-amber-600",
                executiveSummary.health === "at_risk" && "border-orange-500/40 text-orange-600",
                executiveSummary.health === "critical" && "border-rose-500/40 text-rose-600",
              )}
            >
              {resolveHealthStatus
                ? resolveHealthStatus(executiveSummary.health)
                : executiveSummary.health.replace(/_/g, " ")}
            </Badge>
          </div>

          {executiveSummary.topWins.length > 0 ? (
            <div>
              <p className="text-xs font-semibold">{winsLabel}</p>
              <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                {executiveSummary.topWins.map((win) => (
                  <li key={win}>{win}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {executiveSummary.topRisks.length > 0 ? (
            <div>
              <p className="text-xs font-semibold">{risksLabel}</p>
              <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                {executiveSummary.topRisks.map((risk) => (
                  <li key={risk}>{risk}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {executiveSummary.immediateActions.length > 0 ? (
            <div>
              <p className="text-xs font-semibold">{immediateActionsLabel}</p>
              <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                {executiveSummary.immediateActions.map((action) => (
                  <li key={action.id}>
                    {onActionNavigate ? (
                      <button
                        type="button"
                        className="text-start transition-colors hover:text-primary"
                        onClick={() => onActionNavigate(action)}
                      >
                        <span className="font-medium text-foreground">{action.label}</span>
                        {" — "}
                        {action.description}
                      </button>
                    ) : (
                      <>
                        <span className="font-medium text-foreground">{action.label}</span>
                        {" — "}
                        {action.description}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {executiveSummary.longTermOpportunities.length > 0 ? (
            <div>
              <p className="text-xs font-semibold">{longTermLabel}</p>
              <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                {executiveSummary.longTermOpportunities.map((action) => (
                  <li key={action.id}>
                    {onActionNavigate ? (
                      <button
                        type="button"
                        className="text-start transition-colors hover:text-primary"
                        onClick={() => onActionNavigate(action)}
                      >
                        <span className="font-medium text-foreground">{action.label}</span>
                        {" — "}
                        {action.description}
                      </button>
                    ) : (
                      <>
                        <span className="font-medium text-foreground">{action.label}</span>
                        {" — "}
                        {action.description}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <ul className="space-y-3">
        {insights.map((insight) => (
          <li
            key={insight.id}
            className={cn(
              "rounded-lg border p-3",
              insight.priority === "high" && "border-rose-500/30 bg-rose-500/5",
              insight.priority === "medium" && "border-amber-500/30 bg-amber-500/5",
              insight.priority === "low" && "border-border bg-muted/20",
            )}
          >
            <p className="text-sm font-medium">{insight.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{insight.summary}</p>
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
});
