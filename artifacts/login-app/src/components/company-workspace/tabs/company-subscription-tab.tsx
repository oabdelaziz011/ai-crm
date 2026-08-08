import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { PlanFeaturesPanel } from "@/components/billing/panels/plan-features-panel";
import { SubscriptionStatusBadge } from "@/components/billing/status/subscription-status-badge";
import { Button } from "@/components/ui/button";
import { useCompanyWorkspace } from "@/context/company-workspace-context";
import { useAuthUser } from "@/hooks/use-rbac";
import { useWorkspaceBillingSummary } from "@/hooks/workspace/use-workspace-billing-summary";
import {
  billingNotAvailable,
  translateBillingCycle,
} from "@/lib/billing/billing-display-i18n";
import { formatBillingCurrency, formatBillingDate } from "@/lib/billing/format";
import type { BillingSubscriptionStatus, CompanySubscription } from "@/lib/billing/types";
import { canOpenWorkspaceBilling } from "@/lib/company-workspace/permissions";

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value || !String(value).trim()) return null;
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

export function CompanySubscriptionTab() {
  const { t } = useTranslation("common");
  const { bundle, permissions } = useCompanyWorkspace();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canBillingDeepLink = canOpenWorkspaceBilling({ hasPermission, isSuperAdmin });
  const companyId = bundle?.companyId ?? null;
  const { data, isLoading, error } = useWorkspaceBillingSummary(permissions.canSubscription);

  const subscription = data?.subscription as CompanySubscription | null | undefined;
  const plan = (data?.plan ?? subscription?.plan) as CompanySubscription["plan"] | null | undefined;
  const status = subscription?.status as BillingSubscriptionStatus | undefined;

  const nextAmountLabel = useMemo(() => {
    if (data?.next_invoice_amount == null) return null;
    if (!data.currency) return String(data.next_invoice_amount);
    return formatBillingCurrency(Number(data.next_invoice_amount), data.currency);
  }, [data?.currency, data?.next_invoice_amount]);

  if (!permissions.canSubscription) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
        {t("companyWorkspace.subscription.ownerOnly")}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-8 text-sm text-muted-foreground shadow-sm">
        {t("common.loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-card p-8 text-sm text-destructive shadow-sm">
        {error.message}
      </div>
    );
  }

  if (!subscription || !companyId) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
        {t("workspace.billing.noSubscription")}
      </div>
    );
  }

  const seats =
    plan?.max_users != null
      ? t("companyWorkspace.overview.seatsOf", {
          used: bundle?.counts.employees ?? 0,
          limit: plan.max_users,
        })
      : null;
  const storage =
    plan?.storage_gb != null
      ? t("companyWorkspace.overview.storageCapacityValue", { gb: plan.storage_gb })
      : null;

  return (
    <div className="space-y-3">
      {canBillingDeepLink ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button asChild size="sm" variant="outline" className="h-8">
            <Link href="/dashboard/workspace/billing">
              {t("companyWorkspace.subscription.billingHistory")}
            </Link>
          </Button>
          <Button asChild size="sm" className="h-8">
            <Link href="/dashboard/workspace/billing">
              {t("companyWorkspace.subscription.upgrade")}
            </Link>
          </Button>
        </div>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-2">
        <section className="space-y-4 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold">{t("companyWorkspace.subscription.currentPlan")}</h2>
          {status ? (
            <SubscriptionStatusBadge
              status={status}
              currentPeriodEnd={subscription.current_period_end}
              nextRenewalAt={subscription.next_renewal_at}
              trialEndsAt={subscription.trial_ends_at}
              gracePeriodEndsAt={subscription.grace_period_ends_at}
            />
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t("companyWorkspace.overview.currentPlan")}
              value={plan?.display_name ?? plan?.name ?? null}
            />
            <Field
              label={t("companyWorkspace.overview.renewalDate")}
              value={
                subscription.next_renewal_at
                  ? formatBillingDate(subscription.next_renewal_at)
                  : null
              }
            />
            <Field label={t("companyWorkspace.overview.seatUsage")} value={seats} />
            <Field label={t("companyWorkspace.overview.storageCapacity")} value={storage} />
            <Field
              label={t("billing.detail.cycle")}
              value={translateBillingCycle(t, subscription.billing_cycle)}
            />
            <Field
              label={t("workspace.billing.nextInvoice")}
              value={nextAmountLabel ?? billingNotAvailable(t)}
            />
            <Field
              label={t("companyWorkspace.subscription.paymentMethod")}
              value={subscription.payment_method_label}
            />
          </div>
        </section>

        <PlanFeaturesPanel companyId={companyId} />
      </div>
    </div>
  );
}
