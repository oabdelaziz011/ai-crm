import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/context/auth-context";
import { useEmailWorkspaceMetrics } from "@/hooks/email/use-email-workspace-metrics";
import { readEmailWorkspaceAssigneeFromSearch } from "@/lib/email-workspace/email-workspace-assignee-filter";
import {
  EMAIL_WORKSPACE_METRIC_FILTERS,
  buildEmailWorkspaceMetricSearch,
  readEmailWorkspaceMetricFromSearch,
  type EmailWorkspaceMetricFilter,
} from "@/lib/email-workspace/email-workspace-metric-filter";
import { cn } from "@/lib/utils";

type MetricTone = "amber" | "red" | "teal";

const METRIC_TONES: Partial<Record<EmailWorkspaceMetricFilter, MetricTone>> = {
  sent: "teal",
  pending: "amber",
  failed: "red",
  aiRouted: "teal",
};

/**
 * Email landing KPI cards — same size/treatment as the original metric row.
 * Entire card is a filter control; count sources stay unchanged.
 */
export function EmailInboxMetrics() {
  const { t } = useTranslation("common");
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { metrics, isLoading } = useEmailWorkspaceMetrics(companyId);
  const [, setLocation] = useLocation();
  const search = useSearch();
  const activeMetric = readEmailWorkspaceMetricFromSearch(search);

  const conversationId = useMemo(() => {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    return params.get("conversation")?.trim() || null;
  }, [search]);
  const assigneeFilter = useMemo(
    () => readEmailWorkspaceAssigneeFromSearch(search),
    [search],
  );

  const selectMetric = (metric: EmailWorkspaceMetricFilter) => {
    setLocation(
      buildEmailWorkspaceMetricSearch({
        metric,
        conversationId,
        assignee: assigneeFilter,
      }),
    );
  };

  return (
    <div
      role="tablist"
      aria-label={t("emailModule.metrics.tablistAria")}
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 lg:gap-2.5"
      data-testid="email-inbox-metrics"
    >
      {EMAIL_WORKSPACE_METRIC_FILTERS.map((key) => {
        const value = metrics[key];
        const tone = METRIC_TONES[key];
        const active = activeMetric === key;
        const label = t(`emailModule.metrics.${key}`);

        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={t("emailModule.metrics.filterAria", { label })}
            data-testid={`email-metric-${key}`}
            data-metric={key}
            data-active={active ? "true" : "false"}
            onClick={() => selectMetric(key)}
            className={cn(
              "flex min-h-[72px] flex-col justify-center rounded-xl border bg-background px-3.5 py-3 text-start",
              "cursor-pointer transition-colors hover:bg-muted/40",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              active
                ? "border-foreground/20 bg-foreground/[0.04] ring-1 ring-foreground/10"
                : "border-border/60",
              !active && tone === "amber" && "border-amber-200/80",
              !active && tone === "red" && "border-red-200/80",
              !active && tone === "teal" && "border-primary/20",
            )}
          >
            <span
              className={cn(
                "text-[11px] font-medium",
                active ? "text-foreground" : "text-muted-foreground",
              )}
              title={label}
            >
              {label}
            </span>
            <span className="mt-1 text-[22px] font-semibold tabular-nums tracking-[-0.03em] text-foreground">
              {isLoading && value === null ? "…" : value === null ? "—" : value}
            </span>
          </button>
        );
      })}
    </div>
  );
}
