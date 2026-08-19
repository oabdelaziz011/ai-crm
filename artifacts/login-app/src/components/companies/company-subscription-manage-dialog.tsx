import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCompanySubscription } from "@/hooks/billing/use-company-subscriptions";
import { formatBillingCurrency, formatBillingDate } from "@/lib/billing/format";
import {
  translateBillingCycle,
  translatePlanName,
  translateSubscriptionStatus,
} from "@/lib/billing/billing-display-i18n";
import { sanitizeCompanyCommercialError } from "@/lib/companies/company-lifecycle-errors";
import { resolveCompanySubscriptionActionGate } from "@/lib/companies/company-subscription-action-gate";
import type { Company } from "@/lib/types";
import type { CompanySubscription } from "@/lib/billing/types";

type CompanySubscriptionManageDialogProps = {
  company: Company | null;
  open: boolean;
  canChangePackage: boolean;
  onOpenChange: (open: boolean) => void;
  onChangePackage: (subscription: CompanySubscription) => void;
  onConvertTrial: (subscription: CompanySubscription) => void;
};

export function CompanySubscriptionActionLoader({
  company,
  mode,
  onReady,
  onBlocked,
}: {
  company: Company;
  mode: "changePackage" | "convertTrial";
  onReady: (subscription: CompanySubscription) => void;
  onBlocked: (reason: "load" | "trial" | "state" | "cancelled" | "missing") => void;
}) {
  const { t } = useTranslation("common");
  const { data, isLoading, error } = useCompanySubscription(company.id, true);
  const settledRef = useRef(false);

  useEffect(() => {
    settledRef.current = false;
  }, [company.id, mode]);

  useEffect(() => {
    if (isLoading || settledRef.current) return;
    const gate = resolveCompanySubscriptionActionGate({
      mode,
      isLoading,
      error,
      data,
    });
    if (gate.kind === "pending") return;
    settledRef.current = true;
    if (gate.kind === "ready") {
      onReady(gate.subscription);
      return;
    }
    if (import.meta.env.DEV && gate.kind === "load") {
      console.error("[company-subscription-action]", company.id, error);
    }
    onBlocked(gate.kind);
  }, [company.id, data, error, isLoading, mode, onBlocked, onReady]);

  if (!isLoading) return null;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !settledRef.current) {
          settledRef.current = true;
          onBlocked("cancelled");
        }
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{company.name}</DialogTitle>
        </DialogHeader>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("companies.commercial.loading")}
        </p>
      </DialogContent>
    </Dialog>
  );
}

export function CompanySubscriptionManageDialog({
  company,
  open,
  canChangePackage,
  onOpenChange,
  onChangePackage,
  onConvertTrial,
}: CompanySubscriptionManageDialogProps) {
  const { t } = useTranslation("common");
  const companyId = company?.id ?? null;
  const { data: subscription, isLoading, error } = useCompanySubscription(companyId, open && Boolean(companyId));

  const isTrialing = subscription?.status === "trialing";
  const canRunChangePackage =
    canChangePackage &&
    Boolean(subscription) &&
    (subscription?.status === "active" ||
      subscription?.status === "past_due" ||
      subscription?.status === "grace_period");

  const snapshotCount = Array.isArray(subscription?.package_feature_snapshot)
    ? subscription.package_feature_snapshot.length
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("companies.commercial.subscriptionTitle")}
            {company ? `: ${company.name}` : null}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("common.loading", { defaultValue: "…" })}
          </p>
        ) : error ? (
          <p className="text-sm text-destructive">
            {sanitizeCompanyCommercialError(error, t("companies.commercial.loadFailed"))}
          </p>
        ) : !subscription ? (
          <p className="text-sm text-muted-foreground">{t("companies.commercial.noSubscription")}</p>
        ) : (
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4 border-b border-border/60 py-2">
              <dt className="text-muted-foreground">{t("companies.commercial.currentPackage")}</dt>
              <dd className="font-medium">{translatePlanName(t, subscription.plan)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border/60 py-2">
              <dt className="text-muted-foreground">{t("companies.commercial.subscriptionStatus")}</dt>
              <dd className="font-medium">{translateSubscriptionStatus(t, subscription.status)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border/60 py-2">
              <dt className="text-muted-foreground">{t("companies.commercial.billingCycle")}</dt>
              <dd className="font-medium">{translateBillingCycle(t, subscription.billing_cycle)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border/60 py-2">
              <dt className="text-muted-foreground">{t("companies.commercial.periodStart")}</dt>
              <dd className="font-medium">{formatBillingDate(subscription.current_period_start)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border/60 py-2">
              <dt className="text-muted-foreground">{t("companies.commercial.periodEnd")}</dt>
              <dd className="font-medium">{formatBillingDate(subscription.current_period_end)}</dd>
            </div>
            {isTrialing ? (
              <div className="flex justify-between gap-4 border-b border-border/60 py-2">
                <dt className="text-muted-foreground">{t("companies.commercial.trialEnds")}</dt>
                <dd className="font-medium">{formatBillingDate(subscription.trial_ends_at)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4 border-b border-border/60 py-2">
              <dt className="text-muted-foreground">{t("companies.commercial.price")}</dt>
              <dd className="font-medium">
                {formatBillingCurrency(
                  subscription.billing_cycle === "yearly"
                    ? subscription.plan?.price_yearly
                    : subscription.plan?.price_monthly,
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-muted-foreground">{t("companies.commercial.featureSnapshot")}</dt>
              <dd className="font-medium">
                {t("companies.commercial.featureSnapshotCount", { count: snapshotCount })}
              </dd>
            </div>
          </dl>
        )}

        <DialogFooter className="flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("buttons.close", { defaultValue: t("companies.confirm.cancel") })}
          </Button>
          {subscription && isTrialing && canChangePackage ? (
            <Button type="button" onClick={() => onConvertTrial(subscription)}>
              {t("companies.actions.convertTrial")}
            </Button>
          ) : null}
          {subscription && canRunChangePackage ? (
            <Button type="button" onClick={() => onChangePackage(subscription)}>
              {t("companies.actions.changePackage")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
