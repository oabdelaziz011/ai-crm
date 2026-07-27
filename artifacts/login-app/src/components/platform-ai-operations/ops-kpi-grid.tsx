import { Activity, Building2, CheckCircle2, Clock, Coins, ListTodo, XCircle, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DashboardStatCard } from "@/components/dashboard/ui";
import type { PlatformAiOpsKpis } from "@/lib/platform-ai-operations";

type OpsKpiGridProps = {
  data?: PlatformAiOpsKpis;
  loading?: boolean;
};

export function OpsKpiGrid({ data, loading }: OpsKpiGridProps) {
  const { t } = useTranslation("common");

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
      <DashboardStatCard label={t("platformAiOps.kpis.requestsToday")} value={data?.requestsToday ?? "—"} icon={Activity} loading={loading} />
      <DashboardStatCard label={t("platformAiOps.kpis.successful")} value={data?.successfulRequests ?? "—"} icon={CheckCircle2} loading={loading} />
      <DashboardStatCard label={t("platformAiOps.kpis.failed")} value={data?.failedRequests ?? "—"} icon={XCircle} loading={loading} />
      <DashboardStatCard label={t("platformAiOps.kpis.avgLatency")} value={data ? `${data.avgLatencyMs}ms` : "—"} icon={Clock} loading={loading} />
      <DashboardStatCard label={t("platformAiOps.kpis.avgTokens")} value={data?.avgTokens?.toLocaleString() ?? "—"} icon={Zap} loading={loading} />
      <DashboardStatCard label={t("platformAiOps.kpis.estimatedCost")} value={data ? `$${Number(data.estimatedCostUsd).toFixed(4)}` : "—"} icon={Coins} loading={loading} />
      <DashboardStatCard label={t("platformAiOps.kpis.activeCompanies")} value={data?.activeCompanies ?? "—"} icon={Building2} loading={loading} />
      <DashboardStatCard label={t("platformAiOps.kpis.backgroundTasks")} value={data?.backgroundTasks ?? "—"} icon={ListTodo} loading={loading} />
    </div>
  );
}
