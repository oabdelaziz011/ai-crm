import { useTranslation } from "react-i18next";
import { Activity, BarChart3, DollarSign, Users } from "lucide-react";
import { BillingKpiGrid } from "@/components/billing/ui/billing-kpi-grid";
import { DashboardCard, DashboardErrorBanner } from "@/components/dashboard/ui";
import { useBillingRevenueMetrics } from "@/hooks/billing/use-platform-financial-list";
import { useAuthUser } from "@/hooks/use-rbac";
import { canViewBilling } from "@/lib/billing/billing-permissions";
import { formatBillingCurrency } from "@/lib/billing/format";

export function BillingAnalyticsPage() {
  const { t } = useTranslation("common");
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canView = canViewBilling(hasPermission, isSuperAdmin);
  const { data, error, isLoading } = useBillingRevenueMetrics(canView);

  if (!canView) {
    return <p className="text-sm text-muted-foreground">{t("billing.noPermission")}</p>;
  }

  const mrr = data?.mrr ?? 0;
  const paying = data?.active_subscriptions ?? 0;
  const arpu = paying > 0 ? mrr / paying : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("billing.platform.analytics.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("billing.platform.analytics.subtitle")}</p>
      </div>

      {error ? <DashboardErrorBanner message={error.message} /> : null}

      <BillingKpiGrid
        loading={isLoading}
        items={[
          { key: "mrr", label: t("billing.platform.analytics.mrr"), value: formatBillingCurrency(mrr), icon: DollarSign },
          { key: "arr", label: t("billing.platform.analytics.arr"), value: formatBillingCurrency(data?.arr ?? 0), icon: BarChart3 },
          { key: "arpu", label: t("billing.platform.analytics.arpu"), value: formatBillingCurrency(arpu), icon: Users },
          { key: "failed", label: t("billing.platform.analytics.failedRate"), value: `${data?.failed_payment_rate ?? 0}%`, icon: Activity },
        ]}
      />

      <DashboardCard className="grid gap-3 p-5 text-sm sm:grid-cols-2">
        <p>{t("billing.platform.analytics.churn")}: {t("billing.platform.analytics.notAvailable")}</p>
        <p>{t("billing.platform.analytics.renewalRate")}: {t("billing.platform.analytics.notAvailable")}</p>
        <p>{t("billing.platform.analytics.collectionRate")}: {t("billing.platform.analytics.notAvailable")}</p>
        <p>{t("billing.platform.analytics.ltv")}: {t("billing.platform.analytics.notAvailable")}</p>
      </DashboardCard>
    </div>
  );
}
