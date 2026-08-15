/**
 * Initial package assignment only (subscription has no plan_id).
 * Existing package changes MUST use BillingChangePackageDialog → change_company_package_v1.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAssignSubscriptionPlan } from "@/hooks/billing/use-billing-edit";
import { usePlansCatalog } from "@/hooks/billing/use-company-entitlements";
import { formatBillingCurrency } from "@/lib/billing/format";
import type { CompanySubscription } from "@/lib/billing/types";

type BillingAssignPlanDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription: CompanySubscription;
  onSuccess?: () => void;
  onError?: (message: string) => void;
};

export function BillingAssignPlanDialog({
  open,
  onOpenChange,
  subscription,
  onSuccess,
  onError,
}: BillingAssignPlanDialogProps) {
  const { t } = useTranslation("common");
  const mutation = useAssignSubscriptionPlan();
  const { data: plans = [] } = usePlansCatalog(open);
  const [planId, setPlanId] = useState(subscription.plan_id ?? "");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">(subscription.billing_cycle);

  useEffect(() => {
    if (open) {
      setPlanId(subscription.plan_id ?? "");
      setBillingCycle(subscription.billing_cycle);
    }
  }, [open, subscription]);

  const selectedPlan = plans.find((plan) => plan.id === planId);
  const previewPrice =
    billingCycle === "yearly" ? selectedPlan?.price_yearly : selectedPlan?.price_monthly;

  const handleSubmit = async () => {
    if (!planId) {
      onError?.(t("billing.edit.planRequired"));
      return;
    }
    try {
      await mutation.mutateAsync({
        companyId: subscription.company_id,
        planId,
        billingCycle,
      });
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : t("billing.edit.planSaveFailed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("billing.edit.assignInitialPackage", "Assign package")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
            {t(
              "billing.edit.assignInitialPackageHint",
              "Initial package assignment for subscriptions without a package. To change an existing package, use Change Package.",
            )}
          </p>
          <div>
            <label className="text-sm text-muted-foreground">{t("billing.tables.plan")}</label>
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm"
            >
              <option value="">{t("billing.edit.selectPlan")}</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.display_name ?? plan.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">{t("billing.detail.cycle")}</label>
            <select
              value={billingCycle}
              onChange={(e) => setBillingCycle(e.target.value as "monthly" | "yearly")}
              className="mt-1 w-full rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm"
            >
              <option value="monthly">{t("billing.filters.monthly")}</option>
              <option value="yearly">{t("billing.filters.yearly")}</option>
            </select>
          </div>
          {selectedPlan ? (
            <p className="text-sm text-muted-foreground">
              {t("billing.edit.planPricePreview", {
                price: formatBillingCurrency(previewPrice ?? null),
                cycle: billingCycle,
              })}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {t("buttons.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending || !planId}>
            {mutation.isPending
              ? t("billing.common.loading")
              : t("billing.edit.assignInitialPackageConfirm", "Assign package")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
