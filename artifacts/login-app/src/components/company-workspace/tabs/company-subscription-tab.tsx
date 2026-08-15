import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { InvoiceHistoryPanel } from "@/components/billing/panels/invoice-history-panel";
import { PaymentHistoryPanel } from "@/components/billing/panels/payment-history-panel";
import { PlanFeaturesPanel } from "@/components/billing/panels/plan-features-panel";
import { ReceiptHistoryPanel } from "@/components/billing/panels/receipt-history-panel";
import { UsageSummaryPanel } from "@/components/billing/panels/usage-summary-panel";
import { SubscriptionStatusBadge } from "@/components/billing/status/subscription-status-badge";
import { CompanySaasPaymentPanel } from "@/components/company-workspace/company-saas-payment-panel";
import { useAuth } from "@/context/auth-context";
import { useCompanyWorkspace } from "@/context/company-workspace-context";
import { useWorkspaceBillingSummary } from "@/hooks/workspace/use-workspace-billing-summary";
import {
  billingNotAvailable,
  translateBillingCycle,
  translateSubscriptionStatus,
  translateWorkspaceHealth,
} from "@/lib/billing/billing-display-i18n";
import { formatBillingCurrency, formatBillingDate } from "@/lib/billing/format";
import type { BillingSubscriptionStatus, CompanySubscription } from "@/lib/billing/types";

function Field({
  label,
  value,
  showWhenEmpty = false,
}: {
  label: string;
  value: string | null | undefined;
  showWhenEmpty?: boolean;
}) {
  const { t } = useTranslation("common");
  const display = value && String(value).trim() ? value : null;
  if (!display && !showWhenEmpty) return null;
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">
        {display ?? billingNotAvailable(t)}
      </p>
    </div>
  );
}

/**
 * Company Workspace → Plan & billing tab (Phase 8A + Part 4 online payment).
 * Commercial view for the authenticated company's own subscription.
 * Online Pay starts checkout via api-server; settlement remains webhook + Part 3.
 */
export function CompanySubscriptionTab() {
  const { t } = useTranslation("common");
  const { company } = useAuth();
  const { bundle, permissions } = useCompanyWorkspace();
  /** Tenant isolation: always the authenticated company — never a URL/query company id. */
  const companyId = company?.id ?? bundle?.companyId ?? null;
  const { data, isLoading, error } = useWorkspaceBillingSummary(permissions.canSubscription);

  const subscription = data?.subscription as CompanySubscription | null | undefined;
  const plan = (data?.plan ?? subscription?.plan) as CompanySubscription["plan"] | null | undefined;
  const status = subscription?.status as BillingSubscriptionStatus | undefined;

  const tenantAligned = useMemo(() => {
    if (!companyId) return false;
    if (data?.company_id && data.company_id !== companyId) return false;
    if (subscription?.company_id && subscription.company_id !== companyId) return false;
    return true;
  }, [companyId, data?.company_id, subscription?.company_id]);

  const packageName = plan?.display_name ?? plan?.name ?? null;

  const listPriceLabel = useMemo(() => {
    if (!plan) return null;
    const amount =
      subscription?.billing_cycle === "yearly" ? plan.price_yearly : plan.price_monthly;
    if (amount == null || Number.isNaN(Number(amount))) return null;
    const currency = data?.currency ?? undefined;
    return formatBillingCurrency(Number(amount), currency);
  }, [plan, subscription?.billing_cycle, data?.currency]);

  const nextAmountLabel = useMemo(() => {
    if (data?.next_invoice_amount == null) return null;
    return formatBillingCurrency(Number(data.next_invoice_amount), data.currency ?? undefined);
  }, [data?.currency, data?.next_invoice_amount]);

  const isTrialing = status === "trialing";
  const showGraceEnd = status === "grace_period" || Boolean(subscription?.grace_period_ends_at);
  const showPastDueHint = status === "past_due";

  if (!permissions.canSubscription) {
    return (
      <div className="rounded-2xl border border-border bg-background p-8 text-center text-sm text-muted-foreground">
        {t("companyWorkspace.subscription.ownerOnly")}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-background p-8 text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-background p-8 text-sm text-destructive">
        {t(
          "companyWorkspace.subscription.loadError",
          "Could not load billing information. Please try again.",
        )}
      </div>
    );
  }

  if (!companyId || !tenantAligned) {
    return (
      <div className="rounded-2xl border border-border bg-background p-8 text-center text-sm text-muted-foreground">
        {t(
          "companyWorkspace.subscription.tenantMismatch",
          "Billing data is unavailable for this company context.",
        )}
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="rounded-2xl border border-border bg-background p-8 text-center text-sm text-muted-foreground">
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
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold tracking-tight">
          {t("companyWorkspace.subscription.pageTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "companyWorkspace.subscription.pageSubtitle",
            "View your subscription, features, invoices, and payments for this company.",
          )}
        </p>
      </div>

      <section className="space-y-4 rounded-2xl border border-border bg-background p-4">
        <h3 className="text-sm font-semibold">
          {t("companyWorkspace.subscription.overviewSection", "Subscription")}
        </h3>
        {status ? (
          <SubscriptionStatusBadge
            status={status}
            currentPeriodEnd={subscription.current_period_end}
            nextRenewalAt={subscription.next_renewal_at}
            trialEndsAt={subscription.trial_ends_at}
            gracePeriodEndsAt={subscription.grace_period_ends_at}
          />
        ) : null}
        {showPastDueHint ? (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {t(
              "companyWorkspace.subscription.pastDueHint",
              "Your subscription is past due. Contact your billing administrator if you need help.",
            )}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label={t("companyWorkspace.overview.currentPlan")}
            value={packageName}
            showWhenEmpty
          />
          <Field
            label={t("billing.tables.status")}
            value={status ? translateSubscriptionStatus(t, status) : null}
            showWhenEmpty
          />
          <Field
            label={t("billing.detail.cycle")}
            value={translateBillingCycle(t, subscription.billing_cycle)}
            showWhenEmpty
          />
          <Field
            label={t("companyWorkspace.subscription.price", "Price")}
            value={listPriceLabel}
            showWhenEmpty
          />
          <Field
            label={t("companyWorkspace.subscription.currency", "Currency")}
            value={data?.currency ?? null}
            showWhenEmpty
          />
          <Field
            label={t("workspace.billing.health")}
            value={translateWorkspaceHealth(t, data?.workspace_health)}
            showWhenEmpty
          />
          {(isTrialing || subscription.trial_ends_at) && (
            <>
              <Field
                label={t("companyWorkspace.subscription.trialStatus", "Trial status")}
                value={
                  isTrialing
                    ? t("companyWorkspace.subscription.trialActive", "Active trial")
                    : t("companyWorkspace.subscription.trialInactive", "Not on trial")
                }
                showWhenEmpty
              />
              <Field
                label={t("companyWorkspace.subscription.trialEnds", "Trial ends")}
                value={
                  subscription.trial_ends_at
                    ? formatBillingDate(subscription.trial_ends_at)
                    : null
                }
                showWhenEmpty
              />
            </>
          )}
          <Field
            label={t("companyWorkspace.subscription.periodStart", "Period start")}
            value={
              subscription.current_period_start
                ? formatBillingDate(subscription.current_period_start)
                : null
            }
            showWhenEmpty
          />
          <Field
            label={t("billing.detail.periodEnd")}
            value={
              subscription.current_period_end
                ? formatBillingDate(subscription.current_period_end)
                : null
            }
            showWhenEmpty
          />
          <Field
            label={t("companyWorkspace.overview.renewalDate")}
            value={
              subscription.next_renewal_at
                ? formatBillingDate(subscription.next_renewal_at)
                : null
            }
            showWhenEmpty
          />
          {showGraceEnd ? (
            <Field
              label={t("companyWorkspace.subscription.graceEnds", "Grace period ends")}
              value={
                subscription.grace_period_ends_at
                  ? formatBillingDate(subscription.grace_period_ends_at)
                  : null
              }
              showWhenEmpty
            />
          ) : null}
          <Field
            label={t("workspace.billing.nextInvoice")}
            value={nextAmountLabel}
            showWhenEmpty
          />
          <Field
            label={t("billing.detail.autoRenewal")}
            value={
              subscription.auto_renewal ? t("billing.common.yes") : t("billing.common.no")
            }
            showWhenEmpty
          />
          <Field
            label={t("companyWorkspace.subscription.paymentMethod")}
            value={subscription.payment_method_label}
          />
          <Field label={t("companyWorkspace.overview.seatUsage")} value={seats} />
          <Field label={t("companyWorkspace.overview.storageCapacity")} value={storage} />
        </div>
      </section>

      <CompanySaasPaymentPanel
        companyId={companyId}
        subscription={subscription}
        plan={plan}
        currency={data?.currency ?? null}
      />

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">
          {t("companyWorkspace.subscription.featuresSection", "Features & access")}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t(
            "companyWorkspace.subscription.featuresReadOnlyHint",
            "Feature access for your company. Changes are managed by your platform administrator.",
          )}
        </p>
        {/* Read-only: do not pass canManageCommercial — grant/revoke stay platform-admin only. */}
        <PlanFeaturesPanel companyId={companyId} canManageCommercial={false} />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">
          {t("companyWorkspace.subscription.usageSection")}
        </h3>
        <UsageSummaryPanel subscription={subscription} enabled={permissions.canSubscription} />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">
          {t("companyWorkspace.subscription.invoicesSection", "Invoices")}
        </h3>
        <InvoiceHistoryPanel companyId={companyId} enabled={permissions.canSubscription} />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">
          {t("companyWorkspace.subscription.paymentsSection", "Payments")}
        </h3>
        <PaymentHistoryPanel companyId={companyId} enabled={permissions.canSubscription} />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">
          {t("companyWorkspace.subscription.receiptsSection", "Receipts")}
        </h3>
        <ReceiptHistoryPanel companyId={companyId} enabled={permissions.canSubscription} />
      </section>
    </div>
  );
}
