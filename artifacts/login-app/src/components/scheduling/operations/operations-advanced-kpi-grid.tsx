import { useTranslation } from "react-i18next";
import { BarChart3, Clock, TrendingDown, Users, Activity, CalendarClock } from "lucide-react";
import { DashboardStatCard } from "@/components/dashboard/ui";
import type { OperationsAdvancedKpis } from "@/lib/scheduling/operations/analytics";

type OperationsAdvancedKpiGridProps = {
  kpis: OperationsAdvancedKpis;
  loading?: boolean;
};

export function OperationsAdvancedKpiGrid({ kpis, loading }: OperationsAdvancedKpiGridProps) {
  const { t } = useTranslation("common");

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">{t("scheduling.operations.analytics.title")}</h3>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <DashboardStatCard
          label={t("scheduling.operations.analytics.peakHour")}
          value={kpis.peakHour ?? "—"}
          icon={Clock}
          loading={loading}
        />
        <DashboardStatCard
          label={t("scheduling.operations.analytics.avgDelay")}
          value={`${kpis.averageDelayMinutes}${t("scheduling.operations.minutes")}`}
          icon={CalendarClock}
          loading={loading}
        />
        <DashboardStatCard
          label={t("scheduling.operations.analytics.avgWait")}
          value={`${kpis.averageWaitMinutes}${t("scheduling.operations.minutes")}`}
          icon={Users}
          loading={loading}
        />
        <DashboardStatCard
          label={t("scheduling.operations.analytics.cancellationRate")}
          value={`${kpis.cancellationRate}%`}
          icon={TrendingDown}
          loading={loading}
        />
        <DashboardStatCard
          label={t("scheduling.operations.analytics.noShowRate")}
          value={`${kpis.noShowRate}%`}
          icon={Activity}
          loading={loading}
        />
        <DashboardStatCard
          label={t("scheduling.operations.analytics.resourceUtilization")}
          value={`${kpis.resourceUtilizationPercent}%`}
          icon={BarChart3}
          loading={loading}
        />
        <DashboardStatCard
          label={t("scheduling.operations.analytics.todaysLoad")}
          value={kpis.todaysLoad}
          icon={BarChart3}
          loading={loading}
        />
        <DashboardStatCard
          label={t("scheduling.operations.analytics.peakHourBookings")}
          value={kpis.peakHourBookings}
          icon={Clock}
          loading={loading}
        />
      </div>

      {kpis.hourlyDistribution.length > 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h4 className="mb-3 text-sm font-medium">{t("scheduling.operations.analytics.hourlyDistribution")}</h4>
          <div className="flex items-end gap-1 overflow-x-auto pb-1" role="img" aria-label={t("scheduling.operations.analytics.hourlyDistribution")}>
            {kpis.hourlyDistribution.map((bucket) => {
              const max = Math.max(...kpis.hourlyDistribution.map((b) => b.count), 1);
              const height = Math.max(4, Math.round((bucket.count / max) * 48));
              return (
                <div key={bucket.hour} className="flex min-w-[28px] flex-col items-center gap-1">
                  <div
                    className="w-5 rounded-t bg-primary/60 transition-all duration-300"
                    style={{ height }}
                    title={`${bucket.hour}: ${bucket.count}`}
                  />
                  <span className="text-[9px] text-muted-foreground">{bucket.hour.slice(0, 2)}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
