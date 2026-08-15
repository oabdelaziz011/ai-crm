import { CalendarCheck, CheckCircle2, Clock, UserCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { OperationsKpiSnapshot } from "@/lib/scheduling/operations/types";
import { cn } from "@/lib/utils";

type OperationsKpiGridProps = {
  kpis: OperationsKpiSnapshot;
  loading?: boolean;
};

const METRICS = [
  { key: "bookings", icon: CalendarCheck, get: (k: OperationsKpiSnapshot) => String(k.bookings) },
  {
    key: "availableSlots",
    icon: Clock,
    get: (k: OperationsKpiSnapshot) => String(k.availableSlots),
  },
  {
    key: "checkedIn",
    icon: UserCheck,
    get: (k: OperationsKpiSnapshot) => String(k.checkedIn),
  },
  {
    key: "completed",
    icon: CheckCircle2,
    get: (k: OperationsKpiSnapshot) => String(k.completed),
  },
] as const;

export function OperationsKpiGrid({ kpis, loading }: OperationsKpiGridProps) {
  const { t } = useTranslation("common");

  return (
    <div className="grid grid-cols-2 gap-3 border border-border bg-background sm:grid-cols-4">
      {METRICS.map((metric) => {
        const Icon = metric.icon;
        return (
          <div
            key={metric.key}
            className={cn(
              "flex items-center gap-3 border-border px-4 py-3 sm:border-e sm:last:border-e-0",
              "border-b sm:border-b-0 odd:border-e",
            )}
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-[11px] text-muted-foreground">
                {t(`scheduling.operations.kpi.${metric.key}`)}
              </p>
              {loading ? (
                <div className="mt-1 h-6 w-10 animate-pulse rounded bg-muted/30" />
              ) : (
                <p className="text-xl font-semibold tabular-nums tracking-tight">
                  {metric.get(kpis)}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
