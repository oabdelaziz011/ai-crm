import type { ElementType } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PeriodTrend } from "@/lib/dashboard/executive-metrics";

type ExecutiveKpiCardProps = {
  label: string;
  value: string | number;
  icon: ElementType;
  trend: PeriodTrend;
  comparisonLabel: string;
  loading?: boolean;
  onClick?: () => void;
};

export function ExecutiveKpiCard({
  label,
  value,
  icon: Icon,
  trend,
  comparisonLabel,
  loading,
  onClick,
}: ExecutiveKpiCardProps) {
  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border bg-card p-5 text-start shadow-sm transition-all duration-150",
        onClick && "cursor-pointer hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <div className="pointer-events-none absolute -end-6 -top-6 size-20 rounded-full bg-primary/5 transition-transform group-hover:scale-110" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {label}
          </p>
          {loading ? (
            <div className="mt-3 h-9 w-24 animate-pulse rounded-md bg-muted" />
          ) : (
            <p className="mt-2 font-mono text-3xl font-semibold tabular-nums tracking-tight">
              {value}
            </p>
          )}
          {!loading && (
            <div className="mt-2 flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-xs font-semibold",
                  trend.trendUp ? "text-success" : "text-destructive",
                )}
              >
                {trend.trendUp ? (
                  <ArrowUpRight className="size-3.5" />
                ) : (
                  <ArrowDownRight className="size-3.5" />
                )}
                {trend.comparisonLabel}
              </span>
              <span className="text-[11px] text-muted-foreground">{comparisonLabel}</span>
            </div>
          )}
        </div>
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50">
          <Icon className="size-[18px] text-primary" />
        </div>
      </div>
    </Wrapper>
  );
}

export function ExecutiveKpiSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-3">
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          <div className="h-9 w-28 animate-pulse rounded-md bg-muted" />
          <div className="h-3 w-32 animate-pulse rounded bg-muted/60" />
        </div>
        <div className="size-10 animate-pulse rounded-lg bg-muted" />
      </div>
    </div>
  );
}
