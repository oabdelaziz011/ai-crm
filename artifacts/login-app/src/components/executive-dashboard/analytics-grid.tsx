import { memo, useDeferredValue, useMemo } from "react";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardCard } from "@/components/dashboard/ui";
import type { ExecutiveAnalyticsCardModel } from "@/lib/dashboard";

const LazyMiniChart = lazy(() =>
  import("@/components/executive-dashboard/analytics-mini-chart").then((module) => ({
    default: module.AnalyticsMiniChart,
  })),
);

type AnalyticsCardProps = {
  model: ExecutiveAnalyticsCardModel;
  title: string;
  subtitle: string;
  emptyLabel: string;
  href?: string | null;
  onNavigate?: (href: string) => void;
};

export const AnalyticsCard = memo(function AnalyticsCard({
  model,
  title,
  subtitle,
  emptyLabel,
  href,
  onNavigate,
}: AnalyticsCardProps) {
  const deferredSeries = useDeferredValue(model.series);
  const hasData = deferredSeries.some((point) => point.value > 0);
  const interactive = Boolean(href && onNavigate);

  const body = (
    <>
      <header className="mb-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      </header>

      {model.state === "loading" ? (
        <Skeleton className="h-[220px] w-full rounded-lg" aria-hidden />
      ) : !hasData ? (
        <div className="flex flex-1 items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        </div>
      ) : (
        <Suspense fallback={<Skeleton className="h-[220px] w-full rounded-lg" />}>
          <LazyMiniChart chartId={model.id} data={deferredSeries} />
        </Suspense>
      )}
    </>
  );

  if (interactive && href) {
    return (
      <button
        type="button"
        className="flex h-full w-full flex-col rounded-xl border border-border bg-card p-5 text-start shadow-sm transition hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onNavigate?.(href)}
      >
        {body}
      </button>
    );
  }

  return <DashboardCard className="flex h-full flex-col p-5">{body}</DashboardCard>;
});

type AnalyticsGridProps = {
  items: ExecutiveAnalyticsCardModel[];
  resolveTitle: (item: ExecutiveAnalyticsCardModel) => string;
  resolveSubtitle: (item: ExecutiveAnalyticsCardModel) => string;
  emptyLabel: string;
  resolveHref?: (item: ExecutiveAnalyticsCardModel) => string | null;
  onNavigate?: (href: string) => void;
};

export const AnalyticsGrid = memo(function AnalyticsGrid({
  items,
  resolveTitle,
  resolveSubtitle,
  emptyLabel,
  resolveHref,
  onNavigate,
}: AnalyticsGridProps) {
  const cards = useMemo(() => items, [items]);

  return (
    <section aria-label="Analytics overview">
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {cards.map((item) => (
          <AnalyticsCard
            key={item.id}
            model={item}
            title={resolveTitle(item)}
            subtitle={resolveSubtitle(item)}
            emptyLabel={emptyLabel}
            href={resolveHref?.(item) ?? null}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </section>
  );
});
