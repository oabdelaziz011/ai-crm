import { useTranslation } from "react-i18next";
import { Activity } from "lucide-react";
import { BillingEmptyState } from "@/components/billing/ui/billing-empty-state";
import { BillingKpiGrid } from "@/components/billing/ui/billing-kpi-grid";
import { DashboardCard, DashboardErrorBanner, DashboardTableSkeleton } from "@/components/dashboard/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePaymentProviderHealth } from "@/hooks/billing/use-platform-financial-list";
import { useAuthUser } from "@/hooks/use-rbac";
import { billingNotAvailable, formatBillingUnit, translateProviderStatus } from "@/lib/billing/billing-display-i18n";
import { canViewBillingHealth } from "@/lib/billing/billing-permissions";
import { formatBillingDate } from "@/lib/billing/format";

export function BillingProviderHealthPage() {
  const { t } = useTranslation("common");
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canView = canViewBillingHealth(hasPermission, isSuperAdmin);
  const { data, error, isLoading } = usePaymentProviderHealth(canView);

  const providers = data?.providers ?? [];
  const degraded = providers.filter((p) => p.status !== "healthy").length;
  const activeMode = (data?.active_mode as "sandbox" | "production" | undefined) ?? "production";
  const activeProviderCode = (data?.active_provider_code as string | undefined) ?? "manual";

  if (!canView) {
    return <p className="text-sm text-muted-foreground">{t("billing.noPermission")}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("billing.platform.providerHealth.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("billing.platform.providerHealth.subtitle")}</p>
      </div>

      {error ? <DashboardErrorBanner message={error.message} /> : null}

      <DashboardCard className="p-4">
        <p className="text-sm">
          {t("billing.platform.providerHealth.activeMode")}:{" "}
          <span className="font-medium">{t(`billing.settings.providerMode.${activeMode}`)}</span>
          {" · "}
          {t("billing.platform.providerHealth.activeProvider")}:{" "}
          <span className="font-medium">{activeProviderCode}</span>
        </p>
      </DashboardCard>

      <BillingKpiGrid
        loading={isLoading}
        items={[
          { key: "total", label: t("billing.platform.providerHealth.total"), value: providers.length, icon: Activity },
          { key: "degraded", label: t("billing.platform.providerHealth.degraded"), value: degraded, icon: Activity },
        ]}
      />

      <DashboardCard className="overflow-hidden">
        {isLoading ? (
          <DashboardTableSkeleton rows={5} />
        ) : providers.length === 0 ? (
          <BillingEmptyState title={t("billing.platform.providerHealth.empty")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("billing.tables.provider")}</TableHead>
                <TableHead>{t("billing.tables.status")}</TableHead>
                <TableHead>{t("billing.platform.providerHealth.latency")}</TableHead>
                <TableHead>{t("billing.platform.providerHealth.successRate")}</TableHead>
                <TableHead>{t("billing.platform.providerHealth.activeRoute")}</TableHead>
                <TableHead>{t("billing.platform.providerHealth.checkedAt")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.map((provider) => (
                <TableRow key={provider.provider_code}>
                  <TableCell>{provider.display_name}</TableCell>
                  <TableCell>{translateProviderStatus(t, provider.status)}</TableCell>
                  <TableCell>
                    {provider.latency_ms != null
                      ? formatBillingUnit(t, provider.latency_ms, "ms")
                      : billingNotAvailable(t)}
                  </TableCell>
                  <TableCell>
                    {provider.success_rate != null
                      ? formatBillingUnit(t, provider.success_rate, "percent")
                      : billingNotAvailable(t)}
                  </TableCell>
                  <TableCell>
                    {(provider as { is_active_route?: boolean }).is_active_route
                      ? t("billing.common.yes")
                      : t("billing.common.no")}
                  </TableCell>
                  <TableCell>{formatBillingDate(provider.checked_at, true)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DashboardCard>
    </div>
  );
}
