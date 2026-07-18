import { useTranslation } from "react-i18next";
import { UsageSummaryPanel } from "@/components/billing/panels/usage-summary-panel";
import { DashboardCard, DashboardErrorBanner } from "@/components/dashboard/ui";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { useAuth } from "@/context/auth-context";
import { useCompanySubscription } from "@/hooks/billing/use-company-subscriptions";
import { useAuthUser } from "@/hooks/use-rbac";
import { canAccessWorkspace } from "@/lib/workspace/workspace-permissions";

export function WorkspaceUsagePage() {
  const { t } = useTranslation("common");
  const { company } = useAuth();
  const companyId = company?.id ?? null;
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canView = canAccessWorkspace(hasPermission, isSuperAdmin, Boolean(companyId));

  const { data: subscription, isLoading, error } = useCompanySubscription(companyId, canView);

  if (!canView) {
    return <p className="text-sm text-muted-foreground">{t("workspace.noPermission")}</p>;
  }

  if (isLoading) return <DashboardPageFallback />;
  if (error) return <DashboardErrorBanner message={error.message} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("workspace.usage.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("workspace.usage.subtitle")}</p>
      </div>
      {subscription ? (
        <UsageSummaryPanel subscription={subscription} />
      ) : (
        <DashboardCard className="p-5">
          <p className="text-sm text-muted-foreground">{t("workspace.billing.noSubscription")}</p>
        </DashboardCard>
      )}
    </div>
  );
}
