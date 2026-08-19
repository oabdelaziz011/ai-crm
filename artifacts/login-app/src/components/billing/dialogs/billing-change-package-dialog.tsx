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
import { useCompanyCommercialTerms } from "@/hooks/companies/use-company-commercial-terms";
import { formatBillingCurrency } from "@/lib/billing/format";
import { translateBillingCycle, translatePlanName } from "@/lib/billing/billing-display-i18n";
import { CUSTOM_PACKAGE_SENTINEL, resolveDisplayedPackageLabel } from "@/lib/billing/custom-package-config";
import type { CompanySubscription } from "@/lib/billing/types";
import { BillingCustomPackagePanel } from "@/components/billing/dialogs/billing-custom-package-panel";

type BillingChangePackageDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription: CompanySubscription;
  onSuccess?: (result: Record<string, unknown>) => void;
  onError?: (message: string) => void;
};

function codesFromFeatures(rows: { feature_code: string }[]): string[] {
  return rows.map((row) => row.feature_code).sort();
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
  const termsQuery = useCompanyCommercialTerms(subscription.company_id, open);
  const [planId, setPlanId] = useState(subscription.plan_id ?? "");
  const [reason, setReason] = useState("");
  const isCustom = termsQuery.data?.pricing_source === "custom";
  const customSelected = planId === CUSTOM_PACKAGE_SENTINEL;

  useEffect(() => {
    if (open) {
      setPlanId(isCustom ? CUSTOM_PACKAGE_SENTINEL : (subscription.plan_id ?? ""));
      setReason("");
    }
  }, [open, subscription.plan_id, isCustom]);

  const activePackages = packages.filter((pkg) => pkg.is_active !== false);
  const currentPlan =
    activePackages.find((pkg) => pkg.id === subscription.plan_id) ?? subscription.plan;
  const selectedPlan = activePackages.find((pkg) => pkg.id === planId);

  const { data: currentFeatures = [] } = usePackageFeatures(subscription.plan_id, open);
  const { data: targetFeatures = [] } = usePackageFeatures(
    customSelected ? null : planId || null,
    open && Boolean(planId) && !customSelected,
  );

  const diff = useMemo(() => {
    const current = new Set(codesFromFeatures(currentFeatures));
    const target = new Set(codesFromFeatures(targetFeatures));
    return {
      added: [...target].filter((code) => !current.has(code)).sort(),
      removed: [...current].filter((code) => !target.has(code)).sort(),
    };
  }, [currentFeatures, targetFeatures]);

  const listPrice =
    subscription.billing_cycle === "yearly"
      ? selectedPlan?.price_yearly
      : selectedPlan?.price_monthly;

  const handleSubmit = async () => {
    if (planId === CUSTOM_PACKAGE_SENTINEL) return;
    if (!planId) {
      onError?.(t("companies.changePackage.selectPackage"));
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
      onError?.(
        error instanceof Error ? error.message : t("companies.changePackage.saveFailed"),
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("companies.changePackage.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
            {t("companies.changePackage.noPayment")}
          </p>

          <div>
            <label className="text-sm text-muted-foreground">
              {t("companies.changePackage.currentPackage")}
            </label>
            <p className="mt-1 text-sm font-medium">
              {resolveDisplayedPackageLabel(t, {
                hasSubscription: true,
                terms: termsQuery.data,
                plan: currentPlan,
              })}
            </p>
          </div>

          <div>
            <label className="text-sm text-muted-foreground">
              {t("companies.changePackage.newPackage")}
            </label>
            <select
              value={planId}
              onChange={(event) => setPlanId(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm"
            >
              <option value="">{t("companies.changePackage.selectPackage")}</option>
              {activePackages.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {translatePlanName(t, plan)}
                </option>
              ))}
              <option value={CUSTOM_PACKAGE_SENTINEL}>
                {t("companies.changePackage.customPackage")}
              </option>
            </select>
          </div>

          {customSelected ? (
            <BillingCustomPackagePanel
              companyId={subscription.company_id}
              subscription={subscription}
              onCancel={() => onOpenChange(false)}
              onSuccess={(result) => {
                onSuccess?.(result);
                onOpenChange(false);
              }}
              onError={(message) => onError?.(message)}
            />
          ) : (
            <>
              <div>
                <label className="text-sm text-muted-foreground">
                  {t("companies.changePackage.billingCycle")}
                </label>
                <p className="mt-1 text-sm">
                  {translateBillingCycle(t, subscription.billing_cycle)}{" "}
                  <span className="text-muted-foreground">
                    ({t("companies.changePackage.cycleUnchanged")})
                  </span>
                </p>
              </div>

              {selectedPlan ? (
                <p className="text-sm text-muted-foreground">
                  {t("companies.changePackage.listPrice")}: {formatBillingCurrency(listPrice ?? null)} /{" "}
                  {translateBillingCycle(t, subscription.billing_cycle)}
                </p>
              ) : null}

              {planId && (planId !== subscription.plan_id || isCustom) ? (
                <div className="grid gap-3 sm:grid-cols-2 text-sm">
                  <div className="rounded-lg border border-border/50 p-3 space-y-1">
                    <p className="font-medium text-emerald-600 dark:text-emerald-400">
                      {t("companies.changePackage.featuresAdded")}
                    </p>
                    {diff.added.length === 0 ? (
                      <p className="text-muted-foreground text-xs">—</p>
                    ) : (
                      <ul className="list-disc ps-4 text-xs space-y-0.5">
                        {diff.added.map((code) => (
                          <li key={code}>
                            {labelFor(targetFeatures, code, t("companies.commercial.unnamedFeature"))}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="rounded-lg border border-border/50 p-3 space-y-1">
                    <p className="font-medium text-amber-700 dark:text-amber-400">
                      {t("companies.changePackage.featuresRemoved")}
                    </p>
                    {diff.removed.length === 0 ? (
                      <p className="text-muted-foreground text-xs">—</p>
                    ) : (
                      <ul className="list-disc ps-4 text-xs space-y-0.5">
                        {diff.removed.map((code) => (
                          <li key={code}>
                            {labelFor(currentFeatures, code, t("companies.commercial.unnamedFeature"))}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : null}

              <div>
                <label className="text-sm text-muted-foreground">
                  {t("companies.changePackage.adminNotes")}
                </label>
                <Textarea
                  className="mt-1"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={t("companies.changePackage.reasonPlaceholder")}
                  rows={2}
                />
              </div>
            </>
          )}
        </div>
        {customSelected ? null : (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
              {t("companies.changePackage.cancel")}
            </Button>
            <Button
              onClick={() => void handleSubmit()}
              disabled={
                mutation.isPending || !planId || (planId === subscription.plan_id && !isCustom)
              }
            >
              {mutation.isPending
                ? t("billing.common.loading")
                : t("companies.changePackage.confirm")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function labelFor(
  rows: { feature_code: string; label?: string | null }[],
  code: string,
  unnamed: string,
): string {
  const row = rows.find((item) => item.feature_code === code);
  return row?.label?.trim() || unnamed;
}
