import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard/ui";
import { billingNotAvailable, formatBillingUnit, translateBillingCycle } from "@/lib/billing/billing-display-i18n";
import { formatPackageListPrice } from "@/lib/billing/package-pricing";
import type { CompanySubscription } from "@/lib/billing/types";

type PlanExperiencePanelProps = {
  subscription: CompanySubscription;
  /** When true and onChangePackage is set, shows the single "Change package" action. */
  canChangePackage?: boolean;
  onChangePackage?: () => void;
};

/**
 * Package experience summary for an existing subscription.
 * Package changes MUST go through change_company_package_v1 (Change Package dialog),
 * not assign_subscription_plan / UpgradePlanCta.
 */
export function PlanExperiencePanel({
  subscription,
  canChangePackage = false,
  onChangePackage,
}: PlanExperiencePanelProps) {
  const { t } = useTranslation("common");

  const listPriceLabel = formatPackageListPrice(
    {
      pricing_mode: subscription.plan?.pricing_mode,
      price_monthly: subscription.plan?.price_monthly,
      price_yearly: subscription.plan?.price_yearly,
    },
    {
      billingCycle: subscription.billing_cycle,
      withPeriod: true,
      listPricePrefix: t("billing.detail.listPrice", "List price"),
      freeLabel: t("billing.packages.pricingMode.free", "Free"),
      customLabel: t("billing.packages.pricingMode.custom", "Custom / Contact sales"),
    },
  );

  return (
    <DashboardCard className="p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{t("billing.detail.planExperience")}</h2>
          <p className="mt-1 text-lg font-medium">
            {subscription.plan?.display_name ?? subscription.plan?.name ?? t("billing.plan.unassigned")}
          </p>
          <p className="text-sm text-muted-foreground">
            {translateBillingCycle(t, subscription.billing_cycle)} · {listPriceLabel}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t(
              "billing.detail.listPriceHint",
              "Catalog list price — not a recorded payment. Charged amounts are not modeled yet.",
            )}
          </p>
        </div>
        {canChangePackage && onChangePackage ? (
          <Button size="sm" variant="outline" onClick={onChangePackage}>
            {t("billing.edit.changePackage", "Change package")}
          </Button>
        ) : null}
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
