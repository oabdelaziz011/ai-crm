import { useTranslation } from "react-i18next";
import { DashboardCard } from "@/components/dashboard/ui";
import { UpgradePlanCta } from "@/components/billing/panels/upgrade-plan-cta";
import { billingNotAvailable, formatBillingUnit, translateBillingCycle } from "@/lib/billing/billing-display-i18n";
import { formatBillingCurrency } from "@/lib/billing/format";
import type { CompanySubscription } from "@/lib/billing/types";

type PlanExperiencePanelProps = {
  subscription: CompanySubscription;
  enabled?: boolean;
  canChangePlan?: boolean;
  onPlanChanged?: () => void;
  onPlanChangeError?: (message: string) => void;
};

export function PlanExperiencePanel({
  subscription,
  enabled = true,
  canChangePlan = true,
  onPlanChanged,
  onPlanChangeError,
}: PlanExperiencePanelProps) {
  const { t } = useTranslation("common");

  const planPrice =
    subscription.billing_cycle === "yearly"
      ? subscription.plan?.price_yearly
      : subscription.plan?.price_monthly;

  return (
    <DashboardCard className="p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{t("billing.detail.planExperience")}</h2>
          <p className="mt-1 text-lg font-medium">
            {subscription.plan?.display_name ?? subscription.plan?.name ?? t("billing.plan.unassigned")}
          </p>
          <p className="text-sm text-muted-foreground">
            {translateBillingCycle(t, subscription.billing_cycle)} · {formatBillingCurrency(planPrice ?? null)}
          </p>
        </div>
        <UpgradePlanCta
          subscription={subscription}
          enabled={enabled}
          canChangePlan={canChangePlan}
          onSuccess={onPlanChanged}
          onError={onPlanChangeError}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm lg:grid-cols-4">
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
          <p className="text-muted-foreground">{t("billing.detail.maxUsers")}</p>
          <p className="mt-1 text-lg font-semibold">{subscription.plan?.max_users ?? billingNotAvailable(t)}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
          <p className="text-muted-foreground">{t("billing.detail.maxCustomers")}</p>
          <p className="mt-1 text-lg font-semibold">{subscription.plan?.max_customers ?? billingNotAvailable(t)}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
          <p className="text-muted-foreground">{t("billing.detail.storage")}</p>
          <p className="mt-1 text-lg font-semibold">
            {subscription.plan?.storage_gb != null
              ? formatBillingUnit(t, subscription.plan.storage_gb, "gb")
              : billingNotAvailable(t)}
          </p>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
          <p className="text-muted-foreground">{t("billing.detail.aiTokens")}</p>
          <p className="mt-1 text-lg font-semibold">
            {subscription.plan?.ai_tokens_monthly?.toLocaleString() ?? billingNotAvailable(t)}
          </p>
        </div>
      </div>
    </DashboardCard>
  );
}
