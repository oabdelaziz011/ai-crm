import { memo } from "react";
import {
  CalendarClock,
  Crown,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { formatMoney, type StatFilterKey } from "@/lib/customers-list";
import { Skeleton } from "@/components/ui/skeleton";

type StatItem = {
  key: StatFilterKey;
  labelKey: string;
  value: string | number;
  icon: typeof Users;
  accent?: "gold" | "success" | "warning" | "default";
};

type CustomersListStatsProps = {
  stats: {
    total: number;
    active: number;
    vip: number;
    newThisMonth: number;
    outstanding: number;
    appointmentsToday: number;
    revenue: number;
    monthlyGrowth: number;
  };
  activeStat: StatFilterKey | null;
  onStatClick: (key: StatFilterKey) => void;
  loading?: boolean;
};

function StatCard({
  item,
  active,
  onClick,
}: {
  item: StatItem;
  active: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation("common");
  const Icon = item.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex min-w-[132px] flex-1 flex-col gap-1 rounded-xl border px-3 py-2.5 text-start transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-md hover:border-primary/30",
        active
          ? "border-primary/40 bg-primary/10 shadow-sm"
          : "border-border bg-card/80 hover:bg-muted/30",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t(item.labelKey)}
        </span>
        <Icon
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-transform group-hover:scale-110",
            item.accent === "gold" && "text-amber-500",
            item.accent === "success" && "text-emerald-500",
            item.accent === "warning" && "text-orange-500",
            !item.accent && "text-muted-foreground",
          )}
        />
      </div>
      <span className="text-lg font-semibold tabular-nums text-foreground">{item.value}</span>
    </button>
  );
}

export const CustomersListStats = memo(function CustomersListStats({
  stats,
  activeStat,
  onStatClick,
  loading,
}: CustomersListStatsProps) {
  const { t } = useTranslation("common");

  if (loading) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-[68px] min-w-[132px] flex-1 rounded-xl" />
        ))}
      </div>
    );
  }

  const items: StatItem[] = [
    { key: "all", labelKey: "dashboard.customers.list.stats.total", value: stats.total, icon: Users },
    {
      key: "active",
      labelKey: "dashboard.customers.list.stats.active",
      value: stats.active,
      icon: UserCheck,
      accent: "success",
    },
    {
      key: "vip",
      labelKey: "dashboard.customers.list.stats.vip",
      value: stats.vip,
      icon: Crown,
      accent: "gold",
    },
    {
      key: "newThisMonth",
      labelKey: "dashboard.customers.list.stats.newMonth",
      value: stats.newThisMonth,
      icon: TrendingUp,
    },
    {
      key: "outstanding",
      labelKey: "dashboard.customers.list.stats.outstanding",
      value: formatMoney(stats.outstanding),
      icon: Wallet,
      accent: "warning",
    },
    {
      key: "appointmentsToday",
      labelKey: "dashboard.customers.list.stats.appointmentsToday",
      value: stats.appointmentsToday,
      icon: CalendarClock,
    },
    {
      key: "revenue",
      labelKey: "dashboard.customers.list.stats.revenue",
      value: formatMoney(stats.revenue),
      icon: Wallet,
      accent: "success",
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {items.map((item) => (
          <StatCard
            key={item.key}
            item={item}
            active={activeStat === item.key}
            onClick={() => onStatClick(item.key)}
          />
        ))}
        <div
          className={cn(
            "flex min-w-[132px] flex-1 flex-col justify-center rounded-xl border px-3 py-2.5",
            stats.monthlyGrowth >= 0
              ? "border-emerald-500/20 bg-emerald-500/5"
              : "border-orange-500/20 bg-orange-500/5",
          )}
        >
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("dashboard.customers.list.stats.monthlyGrowth")}
          </span>
          <div className="flex items-center gap-1.5">
            {stats.monthlyGrowth >= 0 ? (
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-orange-500" />
            )}
            <span
              className={cn(
                "text-lg font-semibold tabular-nums",
                stats.monthlyGrowth >= 0 ? "text-emerald-600" : "text-orange-600",
              )}
            >
              {stats.monthlyGrowth > 0 ? "+" : ""}
              {stats.monthlyGrowth}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});
