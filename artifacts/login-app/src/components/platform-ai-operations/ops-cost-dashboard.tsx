import { useTranslation } from "react-i18next";
import { DashboardCard, DashboardTableSkeleton } from "@/components/dashboard/ui";
import type { PlatformAiOpsCompanyCost } from "@/lib/platform-ai-operations";

type OpsCostDashboardProps = {
  companies: PlatformAiOpsCompanyCost[];
  loading?: boolean;
};

export function OpsCostDashboard({ companies, loading }: OpsCostDashboardProps) {
  const { t } = useTranslation("common");

  return (
    <DashboardCard className="overflow-hidden">
      <div className="border-b border-border/60 px-5 py-4">
        <h3 className="text-sm font-semibold">{t("platformAiOps.cost.topConsumers")}</h3>
        <p className="text-xs text-muted-foreground">{t("platformAiOps.cost.subtitle")}</p>
      </div>
      {loading ? (
        <DashboardTableSkeleton rows={6} />
      ) : companies.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">{t("platformAiOps.cost.empty")}</p>
      ) : (
        <div className="divide-y divide-border/40">
          {companies.map((row, index) => (
            <div key={row.company_id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
              <div className="flex items-center gap-3">
                <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {index + 1}
                </span>
                <div>
                  <p className="font-medium">{row.company_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.request_count} requests · {row.total_tokens.toLocaleString()} tokens
                  </p>
                </div>
              </div>
              <p className="font-semibold text-primary">${Number(row.estimated_cost).toFixed(4)}</p>
            </div>
          ))}
        </div>
      )}
    </DashboardCard>
  );
}
