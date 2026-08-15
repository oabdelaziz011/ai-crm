import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DashboardCard, DashboardStatCard } from "@/components/dashboard/ui";
import { cn } from "@/lib/utils";

export type ReportKpi = {
  id: string;
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
};

export type ReportSlice = {
  id: string;
  label: string;
  value: number;
  color?: string;
};

export type ReportTableColumn<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
};

const SLICE_COLORS = [
  "bg-emerald-500",
  "bg-sky-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-teal-500",
  "bg-orange-500",
  "bg-indigo-500",
];

export function ReportKpiStrip({
  items,
  loading,
}: {
  items: ReportKpi[];
  loading?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid gap-3",
        items.length <= 2 && "grid-cols-2",
        items.length === 3 && "grid-cols-2 lg:grid-cols-3",
        items.length >= 4 && "grid-cols-2 lg:grid-cols-4",
      )}
    >
      {items.map((item) => (
        <DashboardStatCard
          key={item.id}
          label={item.label}
          value={item.value}
          icon={item.icon}
          loading={loading}
          trend={item.trend}
        />
      ))}
    </div>
  );
}

export function ReportStatusBreakdown({
  title,
  slices,
  emptyLabel,
}: {
  title: string;
  slices: ReportSlice[];
  emptyLabel: string;
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  return (
    <DashboardCard className="p-5">
      <h3 className="mb-4 text-sm font-semibold tracking-tight">{title}</h3>
      {total === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="space-y-3">
          {slices.map((slice, index) => {
            const pct = Math.round((slice.value / total) * 100);
            return (
              <div key={slice.id}>
                <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{slice.label}</span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {slice.value} · {pct}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      slice.color ?? SLICE_COLORS[index % SLICE_COLORS.length],
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DashboardCard>
  );
}

export function ReportBarSeries({
  title,
  labels,
  values,
  emptyLabel,
}: {
  title: string;
  labels: string[];
  values: number[];
  emptyLabel: string;
}) {
  const max = Math.max(...values, 1);
  const hasData = values.some((v) => v > 0);
  return (
    <DashboardCard className="p-5">
      <h3 className="mb-4 text-sm font-semibold tracking-tight">{title}</h3>
      {!hasData ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="flex h-44 items-end gap-2 sm:gap-3">
          {values.map((val, i) => (
            <div key={`${labels[i]}-${i}`} className="flex flex-1 flex-col items-center gap-2">
              <span className="hidden font-mono text-[10px] text-muted-foreground sm:block">
                {val}
              </span>
              <div
                className="w-full rounded-t-md bg-primary/75"
                style={{ height: `${(val / max) * 140}px`, minHeight: val > 0 ? 4 : 0 }}
              />
              <span className="text-[10px] text-muted-foreground">{labels[i]}</span>
            </div>
          ))}
        </div>
      )}
    </DashboardCard>
  );
}

export function ReportDataTable<T extends { id: string }>({
  title,
  columns,
  rows,
  emptyLabel,
  footer,
}: {
  title: string;
  columns: ReportTableColumn<T>[];
  rows: T[];
  emptyLabel: string;
  footer?: string;
}) {
  const { t } = useTranslation("common");
  return (
    <DashboardCard className="overflow-hidden p-0">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        <span className="text-[11px] text-muted-foreground">
          {t("dashboard.reports.tableRows", "{{count}} rows", { count: rows.length })}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead className="sticky top-0 z-[1] bg-muted/80 backdrop-blur">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.id}
                    className={cn(
                      "border-b border-border px-4 py-2.5 text-start text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
                      col.className,
                    )}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-border/70 last:border-0",
                    index % 2 === 1 && "bg-muted/20",
                  )}
                >
                  {columns.map((col) => (
                    <td key={col.id} className={cn("px-4 py-2.5 align-middle", col.className)}>
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {footer ? (
        <div className="border-t border-border px-5 py-2.5 text-[11px] text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </DashboardCard>
  );
}

export function ReportSection({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-4", className)}>{children}</div>;
}

export function countByKey<T>(
  rows: T[],
  getKey: (row: T) => string | null | undefined,
): ReportSlice[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = (getKey(row) ?? "unknown").trim() || "unknown";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([id, value]) => ({ id, label: id, value }))
    .sort((a, b) => b.value - a.value);
}
