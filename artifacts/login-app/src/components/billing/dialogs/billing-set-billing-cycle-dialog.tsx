import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { COMPANY_SUBSCRIPTIONS_KEY } from "@/hooks/billing/use-company-subscriptions";
import { WORKSPACE_BILLING_SUMMARY_KEY } from "@/hooks/workspace/use-workspace-billing-summary";
import { formatBillingCurrency } from "@/lib/billing/format";
import { translateBillingCycle } from "@/lib/billing/billing-display-i18n";
import { supabase } from "@/lib/supabase";
import type { CompanySubscription } from "@/lib/billing/types";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  subscription: CompanySubscription;
};

/**
 * Super-admin only: set monthly vs yearly for an existing package.
 * Company portal shows the selected cycle as read-only on the pay surface.
 */
export function BillingSetBillingCycleDialog({
  open,
  onOpenChange,
  companyId,
  subscription,
}: Props) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const qc = useQueryClient();
  const [cycle, setCycle] = useState<"monthly" | "yearly">(subscription.billing_cycle);

  useEffect(() => {
    if (!open) return;
    setCycle(subscription.billing_cycle);
  }, [open, subscription.billing_cycle]);

  const monthly = subscription.plan?.price_monthly ?? null;
  const yearly = subscription.plan?.price_yearly ?? null;

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("set_company_billing_cycle_v1", {
        p_company_id: companyId,
        p_billing_cycle: cycle,
        p_note: null,
      });
      if (error) throw new Error(error.message);
      return data as Record<string, unknown>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: COMPANY_SUBSCRIPTIONS_KEY });
      qc.invalidateQueries({ queryKey: [...COMPANY_SUBSCRIPTIONS_KEY, companyId] });
      qc.invalidateQueries({ queryKey: WORKSPACE_BILLING_SUMMARY_KEY });
      toast({
        title: t("billing.edit.billingCycleSaved", { defaultValue: "Billing cycle saved" }),
      });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: t("billing.edit.billingCycleFailed", { defaultValue: "Could not save billing cycle" }),
        description: error.message,
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("billing.edit.billingCycleTitle", { defaultValue: "Set billing cycle" })}
          </DialogTitle>
          <DialogDescription>
            {t("billing.edit.billingCycleDescription", {
              defaultValue:
                "Choose monthly or yearly for this company. The company sees the selected cycle and price on Plan & billing — they cannot change it themselves.",
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              { id: "monthly" as const, price: monthly },
              { id: "yearly" as const, price: yearly },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setCycle(option.id)}
              className={cn(
                "rounded-xl border px-3 py-3 text-start transition-colors",
                cycle === option.id
                  ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                  : "border-border/70 bg-background/60 hover:bg-muted/40",
              )}
            >
              <p className="text-sm font-semibold">{translateBillingCycle(t, option.id)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {option.price != null
                  ? formatBillingCurrency(option.price, subscription.plan?.pricing_currency ?? null)
                  : t("billing.common.notAvailable")}
              </p>
              {subscription.billing_cycle === option.id ? (
                <p className="mt-2 text-[11px] font-medium text-primary">
                  {t("billing.edit.billingCycleCurrent", { defaultValue: "Current" })}
                </p>
              ) : null}
            </button>
          ))}
        </div>

        <Label className="sr-only">
          {t("billing.detail.cycle")}
        </Label>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button
            type="button"
            disabled={mutation.isPending || cycle === subscription.billing_cycle}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending
              ? t("common.saving", { defaultValue: "Saving…" })
              : t("billing.edit.billingCycleConfirm", { defaultValue: "Save cycle" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
