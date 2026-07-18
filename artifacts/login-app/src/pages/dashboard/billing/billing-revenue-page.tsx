import { useTranslation } from "react-i18next";
import { DollarSign, TrendingUp } from "lucide-react";
import { BillingKpiGrid } from "@/components/billing/ui/billing-kpi-grid";
import { DashboardCard, DashboardErrorBanner } from "@/components/dashboard/ui";
import { useBillingRevenueMetrics } from "@/hooks/billing/use-platform-financial-list";
import { useAuthUser } from "@/hooks/use-rbac";
import { canViewBillingReports } from "@/lib/billing/billing-permissions";
import { formatBillingCurrency } from "@/lib/billing/format";

export function BillingRevenuePage() {
  const { t } = useTranslation("common");
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canView = canViewBillingReports(hasPermission, isSuperAdmin);
  const { data, error, isLoading } = useBillingRevenueMetrics(canView);

  if (!canView) {
    return <p className="text-sm text-muted-foreground">{t("billing.noPermission")}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("billing.platform.revenue.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("billing.platform.revenue.subtitle")}</p>
      </div>

      {error ? <DashboardErrorBanner message={error.message} /> : null}

      <BillingKpiGrid
        loading={isLoading}
        items={[
          { key: "mrr", label: t("billing.platform.analytics.mrr"), value: formatBillingCurrency(data?.mrr ?? 0), icon: DollarSign },
          { key: "arr", label: t("billing.platform.analytics.arr"), value: formatBillingCurrency(data?.arr ?? 0), icon: TrendingUp },
          { key: "active", label: t("billing.stats.active"), value: data?.active_subscriptions ?? 0, icon: TrendingUp },
          { key: "failed", label: t("billing.platform.analytics.failedRate"), value: `${data?.failed_payment_rate ?? 0}%`, icon: TrendingUp },
        ]}
      />

      <DashboardCard className="p-5 text-sm text-muted-foreground">
        {t("billing.platform.analytics.hint")}
      </DashboardCard>
    </div>
  );
}
