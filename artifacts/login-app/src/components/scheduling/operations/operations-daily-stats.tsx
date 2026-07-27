import { useTranslation } from "react-i18next";
import { DashboardCard } from "@/components/dashboard/ui";
import type { OperationsDailyStats } from "@/lib/scheduling/operations/types";
import { formatOperationsCurrency } from "@/lib/scheduling/operations/utilities";

type OperationsDailyStatsPanelProps = {
  stats: OperationsDailyStats;
  loading?: boolean;
};

export function OperationsDailyStatsPanel({ stats, loading }: OperationsDailyStatsPanelProps) {
  const { t } = useTranslation("common");

  const items = [
    { label: t("scheduling.operations.stats.totalBookings"), value: stats.totalBookings },
    { label: t("scheduling.operations.stats.completed"), value: stats.completed },
    { label: t("scheduling.operations.stats.cancelled"), value: stats.cancelled },
    { label: t("scheduling.operations.stats.noShow"), value: stats.noShow },
    { label: t("scheduling.operations.stats.available"), value: stats.available },
    { label: t("scheduling.operations.stats.occupancy"), value: `${stats.occupancyPercent}%` },
    { label: t("scheduling.operations.stats.revenue"), value: formatOperationsCurrency(stats.revenueCents) },
    {
      label: t("scheduling.operations.stats.avgDuration"),
      value: `${stats.averageDurationMinutes} ${t("scheduling.operations.minutes")}`,
    },
    {
      label: t("scheduling.operations.stats.avgWaiting"),
      value: `${stats.averageWaitingMinutes} ${t("scheduling.operations.minutes")}`,
    },
  ];

  return (
    <DashboardCard className="p-5">
      <h3 className="mb-4 font-semibold">{t("scheduling.operations.stats.title")}</h3>
      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-12 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      ) : (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <div key={item.label} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd className="mt-1 text-lg font-semibold">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </DashboardCard>
  );
}
