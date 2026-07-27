import {
  CalendarCheck,
  CalendarX,
  CheckCircle2,
  Clock,
  DollarSign,
  Percent,
  UserCheck,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { DashboardStatCard } from "@/components/dashboard/ui";
import type { OperationsKpiSnapshot } from "@/lib/scheduling/operations/types";
import { formatOperationsCurrency } from "@/lib/scheduling/operations/utilities";

type OperationsKpiGridProps = {
  kpis: OperationsKpiSnapshot;
  loading?: boolean;
};

export function OperationsKpiGrid({ kpis, loading }: OperationsKpiGridProps) {
  const { t } = useTranslation("common");

  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <DashboardStatCard
        label={t("scheduling.operations.kpi.bookings")}
        value={kpis.bookings}
        icon={CalendarCheck}
        loading={loading}
      />
      <DashboardStatCard
        label={t("scheduling.operations.kpi.availableSlots")}
        value={kpis.availableSlots}
        icon={Clock}
        loading={loading}
      />
      <DashboardStatCard
        label={t("scheduling.operations.kpi.cancelled")}
        value={kpis.cancelled}
        icon={CalendarX}
        loading={loading}
      />
      <DashboardStatCard
        label={t("scheduling.operations.kpi.completed")}
        value={kpis.completed}
        icon={CheckCircle2}
        loading={loading}
      />
      <DashboardStatCard
        label={t("scheduling.operations.kpi.checkedIn")}
        value={kpis.checkedIn}
        icon={UserCheck}
        loading={loading}
      />
      <DashboardStatCard
        label={t("scheduling.operations.kpi.occupancy")}
        value={`${kpis.occupancyPercent}%`}
        icon={Percent}
        loading={loading}
      />
      <DashboardStatCard
        label={t("scheduling.operations.kpi.expectedRevenue")}
        value={formatOperationsCurrency(kpis.expectedRevenueCents)}
        icon={DollarSign}
        loading={loading}
      />
      <DashboardStatCard
        label={t("scheduling.operations.kpi.actualRevenue")}
        value={formatOperationsCurrency(kpis.actualRevenueCents)}
        icon={DollarSign}
        loading={loading}
      />
    </div>
  );
}
