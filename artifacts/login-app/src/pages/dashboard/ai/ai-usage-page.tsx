import { Coins, Cpu, TrendingUp, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import AccessDeniedPage from "@/pages/access-denied";
import { useAuthUser } from "@/hooks/use-rbac";
import {
  DashboardCard,
  DashboardErrorBanner,
  DashboardStatCard,
  DashboardTableSkeleton,
} from "@/components/dashboard/ui";
import { useAiCostAggregate, useAiCostRecords } from "@/hooks/ai-observability/use-ai-costs";

export default function AiUsagePage() {
  const { t } = useTranslation("common");
  const { isSuperAdmin, hasPermission } = useAuthUser();
  const canView = isSuperAdmin || hasPermission("ai.costs.view");
  const { data: aggregate, isLoading, error } = useAiCostAggregate();
  const { data: records = [], isLoading: recordsLoading } = useAiCostRecords(25);

  if (!canView) {
    return <AccessDeniedPage requiredPermission="ai.costs.view" />;
  }

  const providerEntries = Object.entries(aggregate?.byProvider ?? {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("dashboard.aiUsage.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("dashboard.aiUsage.subtitle")}</p>
      </div>

      {error && <DashboardErrorBanner message={error.message} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardStatCard
          label={t("dashboard.aiUsage.stats.tokens")}
          value={aggregate?.totalTokens?.toLocaleString() ?? "—"}
          icon={Zap}
          loading={isLoading}
        />
        <DashboardStatCard
          label={t("dashboard.aiUsage.stats.cost")}
          value={
            aggregate
              ? `${aggregate.currency} ${aggregate.totalCost.toFixed(4)}`
              : "—"
          }
          icon={Coins}
          loading={isLoading}
        />
        <DashboardStatCard
          label={t("dashboard.aiUsage.stats.records")}
          value={aggregate?.recordCount ?? "—"}
          icon={TrendingUp}
          loading={isLoading}
        />
        <DashboardStatCard
          label={t("dashboard.aiUsage.stats.providers")}
          value={providerEntries.length}
          icon={Cpu}
          loading={isLoading}
        />
      </div>

      {providerEntries.length > 0 && (
        <DashboardCard className="p-5">
          <h3 className="font-semibold text-sm mb-4">{t("dashboard.aiUsage.byProvider")}</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {providerEntries.map(([provider, stats]) => (
              <div key={provider} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="font-medium capitalize">{provider}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  {stats.totalTokens.toLocaleString()} tokens · {aggregate?.currency}{" "}
                  {stats.totalCost.toFixed(4)}
                </p>
              </div>
            ))}
          </div>
        </DashboardCard>
      )}

      <DashboardCard className="overflow-hidden">
        <div className="p-5 border-b border-white/5">
          <h3 className="font-semibold text-sm">{t("dashboard.aiUsage.recentRecords")}</h3>
        </div>
        {recordsLoading ? (
          <DashboardTableSkeleton rows={5} />
        ) : (
          <div className="divide-y divide-white/5">
            {records.length === 0 && (
              <p className="p-6 text-sm text-muted-foreground text-center">{t("dashboard.aiUsage.noRecords")}</p>
            )}
            {records.map((record) => (
              <div key={record.id} className="px-5 py-4 flex items-center justify-between gap-4 text-sm">
                <div>
                  <p className="font-medium capitalize">{record.provider_key}</p>
                  <p className="text-xs text-muted-foreground">{record.model}</p>
                </div>
                <div className="text-end">
                  <p className="font-mono">{record.total_tokens.toLocaleString()} tokens</p>
                  <p className="text-xs text-muted-foreground">
                    {record.currency} {record.estimated_cost.toFixed(4)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </DashboardCard>
    </div>
  );
}
