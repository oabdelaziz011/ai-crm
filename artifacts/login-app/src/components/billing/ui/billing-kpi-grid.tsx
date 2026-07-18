import type { LucideIcon } from "lucide-react";
import { DashboardStatCard } from "@/components/dashboard/ui";

type KpiItem = {
  key: string;
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
};

type BillingKpiGridProps = {
  items: KpiItem[];
  loading?: boolean;
};

export function BillingKpiGrid({ items, loading }: BillingKpiGridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <DashboardStatCard
          key={item.key}
          label={item.label}
          value={item.value}
          icon={item.icon}
          trend={item.trend}
          trendUp={item.trendUp}
          loading={loading}
        />
      ))}
    </div>
  );
}
