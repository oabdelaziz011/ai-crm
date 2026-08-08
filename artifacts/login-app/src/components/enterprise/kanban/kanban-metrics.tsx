import { cn } from "@/lib/utils";
import type { KanbanMetric } from "./types";

export function KanbanMetrics({
  metrics,
  className,
  ariaLabel,
}: {
  metrics: readonly KanbanMetric[];
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-4 lg:gap-3",
        className,
      )}
      role="group"
      aria-label={ariaLabel}
    >
      {metrics.map((metric) => (
        <div
          key={metric.id}
          className="rounded-xl border border-border/60 bg-background px-4 py-3 shadow-sm"
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {metric.label}
          </div>
          <div className="mt-1.5 text-[1.35rem] font-semibold tabular-nums tracking-tight">
            {metric.value}
          </div>
          {metric.hint ? (
            <div className="mt-0.5 text-[12px] text-muted-foreground">{metric.hint}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
