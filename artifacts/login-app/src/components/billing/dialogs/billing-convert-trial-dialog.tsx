import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConvertTrialToPaid } from "@/hooks/billing/use-billing-edit";
import { usePlansCatalog } from "@/hooks/billing/use-company-entitlements";
import { formatBillingDate } from "@/lib/billing/format";
import {
  formatPackageListPrice,
  normalizePackagePricingMode,
} from "@/lib/billing/package-pricing";
import type { CompanySubscription } from "@/lib/billing/types";

type BillingConvertTrialDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription: CompanySubscription;
  onSuccess?: () => void;
  onError?: (message: string) => void;
};

export function BillingConvertTrialDialog({
  open,
  onOpenChange,
  subscription,
  onSuccess,
  onError,
}: BillingConvertTrialDialogProps) {
  const { t } = useTranslation("common");
  const mutation = useConvertTrialToPaid();
  const { data: plans = [] } = usePlansCatalog(open);
  const [planId, setPlanId] = useState(subscription.plan_id ?? "");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">(
    subscription.billing_cycle === "yearly" ? "yearly" : "monthly",
  );
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setPlanId(subscription.plan_id ?? "");
    setBillingCycle(subscription.billing_cycle === "yearly" ? "yearly" : "monthly");
    setReason("");
  }, [open, subscription]);

  const paidPlans = useMemo(
    () =>
      plans.filter((plan) => {
        const mode = normalizePackagePricingMode(
          (plan as { pricing_mode?: string }).pricing_mode,
          plan.price_monthly,
          plan.price_yearly,
        );
        if (mode !== "fixed") return false;
        const monthly = Number(plan.price_monthly ?? 0);
        const yearly = Number(plan.price_yearly ?? 0);
        return monthly > 0 || yearly > 0;
      }),
    [plans],
  );

  const selectedPlan = paidPlans.find((plan) => plan.id === planId);

  const listPriceLabel = selectedPlan
    ? formatPackageListPrice(
        {
          pricing_mode: (selectedPlan as { pricing_mode?: string }).pricing_mode,
          price_monthly: selectedPlan.price_monthly,
          price_yearly: selectedPlan.price_yearly,
        },
        {
          billingCycle,
          withPeriod: true,
          listPricePrefix: t("billing.detail.listPrice", "List price"),
        },
      )
    : "—";

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
        reason: reason.trim() || null,
        conversionSource: "admin",
      });
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      onError?.(
        error instanceof Error
          ? error.message
          : t("billing.edit.convertTrialFailed", "Could not convert trial to paid"),
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("billing.edit.convertTrialTitle", "Convert trial to paid")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t(
            "billing.edit.convertTrialDescription",
            "Administratively activates a paid subscription. This does not collect payment.",
          )}
        </p>
        <div className="space-y-4">
          <div className="rounded-lg border px-3 py-2 text-xs text-muted-foreground">
            <p>
              {t("billing.detail.trialEnds", "Trial ends")}:{" "}
              {formatBillingDate(subscription.trial_ends_at)}
            </p>
            <p className="mt-1">
              {t("billing.edit.currentStatus", "Current status")}: {subscription.status}
            </p>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">{t("billing.tables.plan")}</label>
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm"
            >
              <option value="">{t("billing.edit.selectPlan")}</option>
              {paidPlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.display_name || plan.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t(
                "billing.edit.convertTrialPackageHint",
                "Fixed-price packages only. Free/custom packages are not paid conversions.",
              )}
            </p>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">{t("billing.detail.cycle")}</label>
            <select
              value={billingCycle}
              onChange={(e) => setBillingCycle(e.target.value as "monthly" | "yearly")}
              className="mt-1 w-full rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm"
            >
              <option value="monthly">{t("billing.cycle.monthly", "Monthly")}</option>
              <option value="yearly">{t("billing.cycle.yearly", "Yearly")}</option>
            </select>
          </div>
          <div className="rounded-lg border px-3 py-2 text-sm">
            <p className="text-muted-foreground">{listPriceLabel}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t(
                "billing.edit.convertTrialListPriceHint",
                "Catalog list price for reference — not an amount paid.",
              )}
            </p>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">{t("billing.edit.reasonOptional")}</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {t("buttons.cancel")}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={mutation.isPending || !planId}>
            {mutation.isPending
              ? t("billing.common.loading")
              : t("billing.edit.convertTrialConfirm", "Activate subscription")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
