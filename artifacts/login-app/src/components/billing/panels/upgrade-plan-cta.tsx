import { ArrowUpRight } from "lucide-react";
import { useMemo, useState } from "react";
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

type UpgradePlanCtaProps = {
  subscription: CompanySubscription;
  enabled?: boolean;
  canChangePlan?: boolean;
  onSuccess?: () => void;
  onError?: (message: string) => void;
};

export function UpgradePlanCta({
  subscription,
  enabled = true,
  canChangePlan = true,
  onSuccess,
  onError,
}: UpgradePlanCtaProps) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const mutation = useAssignSubscriptionPlan();
  const { data: plans = [] } = usePlansCatalog(enabled && open);

  const currentTier = subscription.plan?.tier_rank ?? 0;
  const highestTier = plans.reduce((max, plan) => Math.max(max, plan.tier_rank ?? 0), 0);
  const isHighestPlan = currentTier >= highestTier && highestTier > 0;

  const upgradeOptions = useMemo(
    () =>
      plans
        .filter((plan) => (plan.tier_rank ?? 0) > currentTier)
        .sort((a, b) => (a.tier_rank ?? 0) - (b.tier_rank ?? 0)),
    [plans, currentTier],
  );

  const handleAssignPlan = async (planId: string) => {
    if (!canChangePlan) return;
    setSelectedPlanId(planId);
    try {
      await mutation.mutateAsync({
        companyId: subscription.company_id,
        planId,
        billingCycle: subscription.billing_cycle,
      });
      onSuccess?.();
      setOpen(false);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : t("billing.edit.planSaveFailed"));
    } finally {
      setSelectedPlanId(null);
    }
  };

  if (isHighestPlan) {
    return (
      <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs text-primary">
        {t("billing.detail.currentPlan")}
      </span>
    );
  }

  return (
    <>
      <Button size="sm" variant="outline" className="gap-2" onClick={() => setOpen(true)} disabled={!canChangePlan}>
        {t("billing.detail.upgradePlan")}
        <ArrowUpRight className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("billing.detail.upgradePlan")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("billing.detail.upgradeHint")}</p>
          <div className="space-y-3">
            {upgradeOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("billing.detail.noUpgradeOptions")}</p>
            ) : (
              upgradeOptions.map((plan) => {
                const price =
                  subscription.billing_cycle === "yearly" ? plan.price_yearly : plan.price_monthly;
                const isPending = mutation.isPending && selectedPlanId === plan.id;
                return (
                  <div
                    key={plan.id}
                    className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="font-medium">{plan.display_name ?? plan.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {subscription.billing_cycle} · {formatBillingCurrency(price ?? null)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="text-xs rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-amber-300">
                        {t("billing.detail.tierRank", { rank: plan.tier_rank ?? 0 })}
                      </span>
                      <Button
                        size="sm"
                        disabled={mutation.isPending || !canChangePlan}
                        onClick={() => handleAssignPlan(plan.id)}
                      >
                        {isPending ? t("billing.common.loading") : t("billing.detail.selectPlan")}
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>
              {t("buttons.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
