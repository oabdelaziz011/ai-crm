import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { translateLeadLifecycleStatus } from "@/lib/i18n/workspace-mock-labels";

export type LeadsCrmMetricId = "all" | "new" | "qualified" | "proposal" | "won" | "lost";

export type LeadsCrmMetric = {
  id: LeadsCrmMetricId;
  count: number;
  lifecycleStatus: string | null;
};

const METRIC_ORDER: LeadsCrmMetricId[] = ["all", "new", "qualified", "proposal", "won", "lost"];

export const LEADS_CRM_METRIC_LIFECYCLE: Record<LeadsCrmMetricId, string | null> = {
  all: null,
  new: "new",
  qualified: "qualified",
  proposal: "proposal_sent",
  won: "converted",
  lost: "lost",
};

export function buildLeadsCrmMetrics(
  statusCounts: Record<string, number> | undefined,
  totalLeads: number,
): LeadsCrmMetric[] {
  const counts = statusCounts ?? {};
  return METRIC_ORDER.map((id) => {
    const lifecycleStatus = LEADS_CRM_METRIC_LIFECYCLE[id];
    if (id === "all") {
      return { id, count: totalLeads, lifecycleStatus: null };
    }
    if (id === "won") {
      return {
        id,
        count: (Number(counts.converted ?? 0) || 0) + (Number(counts.won ?? 0) || 0),
        lifecycleStatus: "converted",
      };
    }
    if (id === "proposal") {
      return {
        id,
        count:
          (Number(counts.proposal_sent ?? 0) || 0) +
          (Number(counts.proposal ?? 0) || 0) +
          (Number(counts.negotiation ?? 0) || 0),
        lifecycleStatus: "proposal_sent",
      };
    }
    return {
      id,
      count: Number(counts[lifecycleStatus!] ?? 0) || 0,
      lifecycleStatus,
    };
  });
}

function metricLabel(t: (key: string) => string, id: LeadsCrmMetricId): string {
  if (id === "all") return t("leads.workspace.filterAll");
  if (id === "won") return t("leads.lifecycle.won");
  if (id === "proposal") return t("leads.lifecycle.proposal");
  return translateLeadLifecycleStatus(t, LEADS_CRM_METRIC_LIFECYCLE[id] ?? id);
}

/** Six equal-width metric cards — full-width CRM filter strip. */
export function LeadsCrmMetricsRow({
  metrics,
  activeId,
  onChange,
}: {
  metrics: LeadsCrmMetric[];
  activeId: LeadsCrmMetricId;
  onChange: (metric: LeadsCrmMetric) => void;
}) {
  const { t } = useTranslation("common");

  return (
    <div
      role="tablist"
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 lg:gap-2.5"
    >
      {metrics.map((metric) => {
        const active = metric.id === activeId;
        return (
          <button
            key={metric.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(metric)}
            className={cn(
              "flex min-h-[72px] flex-col justify-center rounded-xl border px-3.5 py-3 text-start transition-colors",
              active
                ? "border-foreground/20 bg-foreground/[0.04] ring-1 ring-foreground/10"
                : "border-border/60 bg-background hover:border-border hover:bg-muted/30",
            )}
          >
            <span
              className={cn(
                "text-[11px] font-medium",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {metricLabel(t, metric.id)}
            </span>
            <span className="mt-1 text-[22px] font-semibold tabular-nums tracking-[-0.03em] text-foreground">
              {metric.count.toLocaleString()}
            </span>
          </button>
        );
      })}
    </div>
  );
}
