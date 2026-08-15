import { memo } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  CalendarDays,
  DollarSign,
  FileText,
  LifeBuoy,
  Megaphone,
  Minus,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
  Workflow,
  CalendarPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { ExecutiveKpiCardModel } from "@/lib/dashboard";

const ICONS: Record<string, LucideIcon> = {
  DollarSign,
  Users,
  LifeBuoy,
  TrendingUp,
  Bot,
  Workflow,
  CalendarDays,
  FileText,
  UserPlus,
  CalendarPlus,
  Megaphone,
  Sparkles,
};

type KpiCardProps = {
  model: ExecutiveKpiCardModel;
  title: string;
  comparisonLabel: string;
  emptyLabel: string;
  errorLabel: string;
  href?: string | null;
  onNavigate?: (href: string) => void;
};

function TrendBadge({
  trend,
  changePercent,
  comparisonLabel,
}: {
  trend: ExecutiveKpiCardModel["trend"];
  changePercent: number | null;
  comparisonLabel: string;
}) {
  const Icon =
    trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  const tone =
    trend === "up" ? "text-emerald-500" : trend === "down" ? "text-rose-500" : "text-muted-foreground";

  return (
    <div className="mt-2 flex items-center gap-2">
      <span className={cn("inline-flex items-center gap-0.5 text-xs font-semibold", tone)}>
        <Icon className="size-3.5" aria-hidden />
        {changePercent != null ? `${changePercent > 0 ? "+" : ""}${changePercent}%` : "—"}
      </span>
      <span className="text-[11px] text-muted-foreground">{comparisonLabel}</span>
    </div>
  );
}

export const KpiCard = memo(function KpiCard({
  model,
  title,
  comparisonLabel,
  emptyLabel,
  errorLabel,
  href,
  onNavigate,
}: KpiCardProps) {
  const Icon = ICONS[model.icon] ?? TrendingUp;
  const interactive = Boolean(href && onNavigate);

  const content = (
    <>
      <div className="pointer-events-none absolute -end-6 -top-6 size-20 rounded-full bg-primary/5" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {title}
          </p>
          {model.state === "loading" ? (
            <Skeleton className="mt-3 h-9 w-24" />
          ) : model.state === "error" ? (
            <p className="mt-2 text-sm text-destructive">{model.errorMessage ?? errorLabel}</p>
          ) : model.state === "empty" ? (
            <p className="mt-2 text-2xl font-semibold text-muted-foreground">{emptyLabel}</p>
          ) : (
            <p className="mt-2 font-mono text-3xl font-semibold tabular-nums tracking-tight">
              {model.value}
            </p>
          )}
          {model.state === "ready" ? (
            <TrendBadge
              trend={model.trend}
              changePercent={model.changePercent}
              comparisonLabel={comparisonLabel}
            />
          ) : null}
        </div>
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50">
          <Icon className="size-[18px] text-primary" aria-hidden />
        </div>
      </div>
    </>
  );

  if (interactive && href) {
    return (
      <button
        type="button"
        className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 text-start shadow-sm transition-shadow duration-150 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={title}
        onClick={() => onNavigate?.(href)}
      >
        {content}
      </button>
    );
  }

  return (
    <article
      className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow duration-150 hover:shadow-md"
      aria-label={title}
    >
      {content}
    </article>
  );
});

type KpiGridProps = {
  items: ExecutiveKpiCardModel[];
  resolveTitle: (item: ExecutiveKpiCardModel) => string;
  comparisonLabel: string;
  emptyLabel: string;
  errorLabel: string;
  resolveHref?: (item: ExecutiveKpiCardModel) => string | null;
  onNavigate?: (href: string) => void;
};

export const KpiGrid = memo(function KpiGrid({
  items,
  resolveTitle,
  comparisonLabel,
  emptyLabel,
  errorLabel,
  resolveHref,
  onNavigate,
}: KpiGridProps) {
  return (
    <section aria-label="Key performance indicators">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <KpiCard
            key={item.id}
            model={item}
            title={resolveTitle(item)}
            comparisonLabel={comparisonLabel}
            emptyLabel={emptyLabel}
            errorLabel={errorLabel}
            href={resolveHref?.(item) ?? null}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </section>
  );
});
