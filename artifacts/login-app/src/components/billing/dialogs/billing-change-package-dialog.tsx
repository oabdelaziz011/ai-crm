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
import { Textarea } from "@/components/ui/textarea";
import { useChangeCompanyPackage } from "@/hooks/billing/use-billing-edit";
import { usePackageFeatures, useCommercialPackages } from "@/hooks/billing/use-commercial-packages";
import { formatBillingCurrency } from "@/lib/billing/format";
import { translateBillingCycle } from "@/lib/billing/billing-display-i18n";
import type { CompanySubscription } from "@/lib/billing/types";

type BillingChangePackageDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription: CompanySubscription;
  onSuccess?: (result: Record<string, unknown>) => void;
  onError?: (message: string) => void;
};

function codesFromFeatures(rows: { feature_code: string }[]): string[] {
  return rows.map((r) => r.feature_code).sort();
}

export function BillingChangePackageDialog({
  open,
  onOpenChange,
  subscription,
  onSuccess,
  onError,
}: BillingChangePackageDialogProps) {
  const { t } = useTranslation("common");
  const mutation = useChangeCompanyPackage();
  const { data: packages = [] } = useCommercialPackages(open);
  const [planId, setPlanId] = useState(subscription.plan_id ?? "");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      setPlanId(subscription.plan_id ?? "");
      setReason("");
    }
  }, [open, subscription.plan_id]);

  const activePackages = packages.filter((p) => p.is_active !== false);
  const currentPlan = activePackages.find((p) => p.id === subscription.plan_id) ?? subscription.plan;
  const selectedPlan = activePackages.find((p) => p.id === planId);

  const { data: currentFeatures = [] } = usePackageFeatures(subscription.plan_id, open);
  const { data: targetFeatures = [] } = usePackageFeatures(planId || null, open && Boolean(planId));

  const diff = useMemo(() => {
    const current = new Set(codesFromFeatures(currentFeatures));
    const target = new Set(codesFromFeatures(targetFeatures));
    const added = [...target].filter((c) => !current.has(c)).sort();
    const removed = [...current].filter((c) => !target.has(c)).sort();
    return { added, removed };
  }, [currentFeatures, targetFeatures]);

  const listPrice =
    subscription.billing_cycle === "yearly"
      ? selectedPlan?.price_yearly
      : selectedPlan?.price_monthly;

  const handleSubmit = async () => {
    if (!planId) {
      onError?.(t("billing.edit.planRequired"));
      return;
    }
    try {
      const result = await mutation.mutateAsync({
        companyId: subscription.company_id,
        planId,
        reason: reason.trim() || null,
      });
      onSuccess?.(result);
      onOpenChange(false);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : t("billing.edit.changePackageFailed", "Package change failed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("billing.edit.changePackage", "Change package")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
            {t(
              "billing.edit.changePackageNoPayment",
              "No payment is collected in this action. List price is shown for reference only.",
            )}
          </p>

          <div>
            <label className="text-sm text-muted-foreground">
              {t("billing.edit.currentPackage", "Current package")}
            </label>
            <p className="mt-1 text-sm font-medium">
              {currentPlan?.display_name ?? currentPlan?.name ?? billingFallback(subscription.plan_id)}
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
              {activePackages.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.display_name ?? plan.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-muted-foreground">{t("billing.detail.cycle")}</label>
            <p className="mt-1 text-sm">
              {translateBillingCycle(t, subscription.billing_cycle)}{" "}
              <span className="text-muted-foreground">
                ({t("billing.edit.cycleReadOnly", "unchanged")})
              </span>
            </p>
          </div>

          {selectedPlan ? (
            <p className="text-sm text-muted-foreground">
              {t("billing.edit.listPriceLabel", "List price")}:{" "}
              {formatBillingCurrency(listPrice ?? null)} / {subscription.billing_cycle}
            </p>
          ) : null}

          {planId && planId !== subscription.plan_id ? (
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div className="rounded-lg border border-border/50 p-3 space-y-1">
                <p className="font-medium text-emerald-600 dark:text-emerald-400">
                  {t("billing.edit.featuresAdded", "Added features")}
                </p>
                {diff.added.length === 0 ? (
                  <p className="text-muted-foreground text-xs">—</p>
                ) : (
                  <ul className="list-disc ps-4 text-xs space-y-0.5">
                    {diff.added.map((code) => (
                      <li key={code}>{labelFor(targetFeatures, code)}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-lg border border-border/50 p-3 space-y-1">
                <p className="font-medium text-amber-700 dark:text-amber-400">
                  {t("billing.edit.featuresRemoved", "Removed package features")}
                </p>
                {diff.removed.length === 0 ? (
                  <p className="text-muted-foreground text-xs">—</p>
                ) : (
                  <ul className="list-disc ps-4 text-xs space-y-0.5">
                    {diff.removed.map((code) => (
                      <li key={code}>{labelFor(currentFeatures, code)}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}

          <div>
            <label className="text-sm text-muted-foreground">{t("billing.edit.reason", "Reason")}</label>
            <Textarea
              className="mt-1"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("billing.edit.changePackageReasonPlaceholder", "Optional admin note")}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {t("buttons.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={mutation.isPending || !planId || planId === subscription.plan_id}
          >
            {mutation.isPending
              ? t("billing.common.loading")
              : t("billing.edit.changePackageConfirm", "Confirm package change")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function labelFor(rows: { feature_code: string; label?: string | null }[], code: string): string {
  const row = rows.find((r) => r.feature_code === code);
  return row?.label?.trim() ? `${row.label} (${code})` : code;
}

function billingFallback(planId: string | null | undefined): string {
  return planId ? String(planId).slice(0, 8) : "—";
}
