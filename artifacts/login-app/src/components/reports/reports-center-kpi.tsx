import type { ElementType } from "react";
import {
  CalendarDays,
  Coins,
  DollarSign,
  FileText,
  Target,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCompanyLocaleContext } from "@/context/company-locale-context";
import { cn } from "@/lib/utils";
import type { ReportsCenterKpi } from "@/lib/reports/reports-center-metrics";

const ICONS: Record<ReportsCenterKpi["icon"], ElementType> = {
  revenue: DollarSign,
  customers: Users,
  bookings: CalendarDays,
  invoices: FileText,
  collection: Coins,
  leads: Target,
};

function MiniSpark({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="mt-2 flex h-6 items-end gap-0.5" aria-hidden>
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-[2px] bg-primary/30"
          style={{ height: `${Math.max(10, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

export function ReportsCenterKpiGrid({
  kpis,
  loading,
  onSelect,
}: {
  kpis: ReportsCenterKpi[];
  loading?: boolean;
  onSelect?: (reportId: string) => void;
}) {
  const { t } = useTranslation("common");
  const { formatCurrency } = useCompanyLocaleContext();

  if (!loading && kpis.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
      {(loading ? Array.from({ length: 4 }).map((_, i) => ({ id: `sk-${i}` }) as const) : kpis).map(
        (item) => {
          if (loading || !("value" in item)) {
            return (
              <div key={item.id} className="rounded-xl border border-border bg-card p-3">
                <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                <div className="mt-2 h-6 w-20 animate-pulse rounded bg-muted" />
              </div>
            );
          }
          const kpi = item as ReportsCenterKpi;
          const Icon = ICONS[kpi.icon];
          const display =
            kpi.format === "currency"
              ? formatCurrency(kpi.value)
              : kpi.format === "percent"
                ? `${kpi.value}%`
                : kpi.value;
          return (
            <button
              key={kpi.id}
              type="button"
              disabled={!kpi.reportId || !onSelect}
              onClick={() => {
                if (kpi.reportId && onSelect) onSelect(kpi.reportId);
              }}
              className={cn(
                "rounded-xl border border-border bg-card p-3 text-start transition-colors",
                kpi.reportId && onSelect && "hover:border-primary/40 hover:bg-primary/[0.03]",
                (!kpi.reportId || !onSelect) && "cursor-default",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-medium leading-tight text-muted-foreground">
                  {t(kpi.labelKey)}
                </p>
                <span className="rounded-md bg-primary/10 p-1 text-primary">
                  <Icon className="h-3 w-3" />
                </span>
              </div>
              <p className="mt-1.5 text-lg font-semibold tracking-tight tabular-nums text-foreground md:text-xl">
                {display}
              </p>
              {kpi.sparkline ? <MiniSpark values={kpi.sparkline} /> : null}
            </button>
          );
        },
      )}
    </div>
  );
}
