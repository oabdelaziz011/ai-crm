import { useTranslation } from "react-i18next";
import { DashboardCard } from "@/components/dashboard/ui";
import type { OperationsCapacityMetrics } from "@/lib/scheduling/operations/analytics";

type OperationsCapacityMeterProps = {
  metrics: OperationsCapacityMetrics;
  loading?: boolean;
};

type MeterRow = {
  labelKey: string;
  value: number;
  accentClass: string;
};

export function OperationsCapacityMeter({ metrics, loading }: OperationsCapacityMeterProps) {
  const { t } = useTranslation("common");

  const rows: MeterRow[] = [
    {
      labelKey: "scheduling.operations.capacity.occupancy",
      value: metrics.occupancyPercent,
      accentClass: "bg-emerald-500",
    },
    {
      labelKey: "scheduling.operations.capacity.availability",
      value: metrics.availabilityPercent,
      accentClass: "bg-blue-500",
    },
    {
      labelKey: "scheduling.operations.capacity.utilization",
      value: metrics.utilizationPercent,
      accentClass: "bg-amber-500",
    },
  ];

  return (
    <DashboardCard className="p-5">
      <h3 className="mb-4 font-semibold">{t("scheduling.operations.capacity.title")}</h3>
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {rows.map((row) => (
            <div key={row.labelKey} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t(row.labelKey)}</span>
                <span className="font-semibold tabular-nums">{row.value}%</span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out ${row.accentClass}`}
                  style={{ width: `${Math.min(100, Math.max(0, row.value))}%` }}
                  role="progressbar"
                  aria-valuenow={row.value}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={t(row.labelKey)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardCard>
  );
}
