import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PlanFeaturesPanel } from "@/components/billing/panels/plan-features-panel";
import { SubscriptionStatusBadge } from "@/components/billing/status/subscription-status-badge";
import { CompanyIdentityHeader } from "@/components/billing/identity/company-identity-header";
import { DashboardCard, DashboardErrorBanner } from "@/components/dashboard/ui";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { useAuth } from "@/context/auth-context";
import { useBillingContact } from "@/hooks/billing/use-billing-contact";
import { useCompanyIdentity } from "@/hooks/company-workspace/use-company-identity";
import { useWorkspaceBillingSummary } from "@/hooks/workspace/use-workspace-billing-summary";
import { useAuthUser } from "@/hooks/use-rbac";
import { billingNotAvailable, translateBillingCycle, translateWorkspaceHealth } from "@/lib/billing/billing-display-i18n";
import { formatBillingCurrency, formatBillingDate } from "@/lib/billing/format";
import { canViewWorkspaceBilling } from "@/lib/workspace/workspace-permissions";
import type { BillingSubscriptionStatus, CompanySubscription } from "@/lib/billing/types";

export function WorkspaceBillingPage() {
  const { t } = useTranslation("common");
  const { company } = useAuth();
  const companyId = company?.id ?? null;
  const { identity, displayName } = useCompanyIdentity(Boolean(companyId));
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canView = canViewWorkspaceBilling(hasPermission, isSuperAdmin, Boolean(companyId));

  const { data, isLoading, error } = useWorkspaceBillingSummary(canView);
  const { data: billingContact } = useBillingContact(companyId, canView);

  const subscription = data?.subscription as CompanySubscription | null | undefined;
  const plan = data?.plan as CompanySubscription["plan"] | null | undefined;

  const status = subscription?.status as BillingSubscriptionStatus | undefined;

  const nextAmountLabel = useMemo(() => {
    if (data?.next_invoice_amount == null) return billingNotAvailable(t);
    if (!data.currency) return String(data.next_invoice_amount);
    return formatBillingCurrency(Number(data.next_invoice_amount), data.currency);
  }, [data?.currency, data?.next_invoice_amount, t]);

  if (!canView) {
    return <p className="text-sm text-muted-foreground">{t("workspace.noPermission")}</p>;
  }

  if (isLoading) return <DashboardPageFallback />;
  if (error) return <DashboardErrorBanner message={error.message} />;

  if (!subscription || !companyId) {
    return (
      <DashboardCard className="p-5">
        <p className="text-sm text-muted-foreground">{t("workspace.billing.noSubscription")}</p>
      </DashboardCard>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("workspace.billing.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("workspace.billing.subtitle")}</p>
      </div>

      <CompanyIdentityHeader
        companyId={companyId}
        name={data?.company?.name ?? displayName ?? billingNotAvailable(t)}
        logoUrl={data?.company?.logo_url ?? identity?.logoUrl ?? company?.logo_url}
        billingContact={billingContact}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <DashboardCard className="space-y-4 p-5">
          <h2 className="font-semibold">{t("workspace.billing.currentSubscription")}</h2>
          {status ? (
            <SubscriptionStatusBadge
              status={status}
              currentPeriodEnd={subscription.current_period_end}
              nextRenewalAt={subscription.next_renewal_at}
              trialEndsAt={subscription.trial_ends_at}
              gracePeriodEndsAt={subscription.grace_period_ends_at}
            />
          ) : null}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">{t("billing.detail.cycle")}</p>
              <p className="font-medium">{translateBillingCycle(t, subscription.billing_cycle)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t("workspace.billing.health")}</p>
              <p className="font-medium">{translateWorkspaceHealth(t, data?.workspace_health)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t("billing.detail.nextRenewal")}</p>
              <p className="font-medium">{formatBillingDate(subscription.next_renewal_at)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t("billing.detail.periodEnd")}</p>
              <p className="font-medium">{formatBillingDate(subscription.current_period_end)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t("workspace.billing.nextInvoice")}</p>
              <p className="font-medium">{nextAmountLabel}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t("billing.detail.autoRenewal")}</p>
              <p className="font-medium">
                {subscription.auto_renewal ? t("billing.common.yes") : t("billing.common.no")}
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {plan?.display_name ?? plan?.name ?? t("billing.plan.unassigned")}
          </p>
        </DashboardCard>

        <PlanFeaturesPanel companyId={companyId} />
      </div>
    </div>
  );
}
