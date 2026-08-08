import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export type EmployeeQuickStats = {
  total: number;
  active: number;
  invited: number;
  suspended: number;
  branchManagers: number;
  departmentManagers: number;
};

type Props = {
  stats: EmployeeQuickStats;
  className?: string;
};

export function EmployeeStatsStrip({ stats, className }: Props) {
  const { t } = useTranslation("common");

  const cards = [
    { key: "total", label: t("companyWorkspace.employees.stats.total"), value: stats.total },
    { key: "active", label: t("companyWorkspace.employees.stats.active"), value: stats.active },
    { key: "invited", label: t("companyWorkspace.employees.stats.invited"), value: stats.invited },
    {
      key: "suspended",
      label: t("companyWorkspace.employees.stats.suspended"),
      value: stats.suspended,
    },
    {
      key: "branchManagers",
      label: t("companyWorkspace.employees.stats.branchManagers"),
      value: stats.branchManagers,
    },
    {
      key: "departmentManagers",
      label: t("companyWorkspace.employees.stats.departmentManagers"),
      value: stats.departmentManagers,
    },
  ] as const;

  return (
    <div className={cn("grid gap-2 sm:grid-cols-3 xl:grid-cols-6", className)}>
      {cards.map((card) => (
        <div
          key={card.key}
          className="rounded-2xl border border-border/60 bg-card px-3 py-2.5 shadow-sm"
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {card.label}
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-foreground">
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}
