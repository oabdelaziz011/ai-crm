import { useTranslation } from "react-i18next";
import { DashboardCard } from "@/components/dashboard/ui";
import type { ResourceUtilizationRow } from "@/lib/scheduling/operations/analytics";

type OperationsResourceUtilizationProps = {
  rows: ResourceUtilizationRow[];
  loading?: boolean;
};

export function OperationsResourceUtilization({
  rows,
  loading,
}: OperationsResourceUtilizationProps) {
  const { t } = useTranslation("common");

  return (
    <DashboardCard className="p-5">
      <h3 className="mb-4 font-semibold">{t("scheduling.operations.utilization.title")}</h3>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/20" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("scheduling.operations.utilization.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-start text-xs text-muted-foreground">
                <th className="pb-2 pe-4 font-medium">{t("scheduling.operations.utilization.resource")}</th>
                <th className="pb-2 pe-4 font-medium">{t("scheduling.operations.utilization.bookings")}</th>
                <th className="pb-2 pe-4 font-medium">{t("scheduling.operations.utilization.busy")}</th>
                <th className="pb-2 pe-4 font-medium">{t("scheduling.operations.utilization.completed")}</th>
                <th className="pb-2 font-medium">{t("scheduling.operations.utilization.avgDelay")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.resourceId} className="border-b border-border/40 last:border-0">
                  <td className="py-2.5 pe-4">
                    <div className="font-medium">{row.resourceName}</div>
                    <div className="text-xs capitalize text-muted-foreground">{row.resourceType}</div>
                  </td>
                  <td className="py-2.5 pe-4 tabular-nums">{row.bookingsCount}</td>
                  <td className="py-2.5 pe-4">
                    <UtilBar value={row.busyPercent} tone="emerald" />
                  </td>
                  <td className="py-2.5 pe-4">
                    <UtilBar value={row.completedPercent} tone="blue" />
                  </td>
                  <td className="py-2.5 tabular-nums">
                    {row.averageDelayMinutes}
                    {t("scheduling.operations.minutes")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardCard>
  );
}

function UtilBar({ value, tone }: { value: number; tone: "emerald" | "blue" }) {
  const color = tone === "emerald" ? "bg-emerald-500" : "bg-blue-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/30">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.min(100, value)}%` }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <span className="w-8 text-end text-xs tabular-nums">{value}%</span>
    </div>
  );
}
