import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import {
  useCreateSaasCheckout,
  useSaasCheckoutReturnSession,
} from "@/hooks/billing/use-saas-checkout";
import { WORKSPACE_BILLING_SUMMARY_KEY } from "@/hooks/workspace/use-workspace-billing-summary";
import {
  buildSaasPaymentReturnUrl,
  derivePortalPaymentReturnState,
  isSaasCheckoutApiConfigured,
} from "@/lib/billing/saas-checkout-api";
import {
  expectedListPriceAmount,
  resolveSaasPaymentEligibility,
} from "@/lib/billing/saas-payment-eligibility";
import { formatBillingCurrency } from "@/lib/billing/format";
import type { CompanySubscription } from "@/lib/billing/types";
import { canInitiateCompanyOnlinePayment } from "@/lib/company-workspace/permissions";

type CompanySaasPaymentPanelProps = {
  companyId: string;
  subscription: CompanySubscription;
  plan: CompanySubscription["plan"] | null | undefined;
  currency: string | null | undefined;
};

export function CompanySaasPaymentPanel({
  companyId,
  subscription,
  plan,
  currency,
}: CompanySaasPaymentPanelProps) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { company } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const search = useSearch();
  const qc = useQueryClient();
  const createCheckout = useCreateSaasCheckout();
  const idempotencyRef = useRef<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const canInitiate = canInitiateCompanyOnlinePayment({ hasPermission, isSuperAdmin });
  const eligibility = useMemo(
    () =>
      resolveSaasPaymentEligibility({
        canInitiate,
        companyId,
        companyStatus: company?.status ?? subscription.company?.status,
        approvalStatus: company?.approval_status ?? subscription.company?.approval_status,
        subscription,
        plan,
      }),
    [canInitiate, company, companyId, plan, subscription],
  );

  const expectedAmount = expectedListPriceAmount(subscription, plan);
  const displayCurrency = currency ?? null;

  const params = useMemo(() => new URLSearchParams(search), [search]);
  const isReturn = params.get("payment_return") === "1";
  const returnQuery = useSaasCheckoutReturnSession(isReturn);
  const returnState = derivePortalPaymentReturnState(returnQuery.data ?? null);

  // One extra summary refresh after return (not continuous polling)
  useEffect(() => {
    if (!isReturn) return;
    void qc.invalidateQueries({ queryKey: WORKSPACE_BILLING_SUMMARY_KEY });
    const timer = window.setTimeout(() => {
      void qc.invalidateQueries({ queryKey: WORKSPACE_BILLING_SUMMARY_KEY });
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [isReturn, qc]);

  const handlePay = async () => {
    setLocalError(null);
    if (!eligibility.allowed || expectedAmount == null || !displayCurrency) {
      setLocalError(t(eligibility.reasonKey, "Payment is not available."));
      return;
    }
    if (!isSaasCheckoutApiConfigured()) {
      setLocalError(t("companyWorkspace.payment.apiMissing", "Payment API is not configured."));
      return;
    }

    if (!idempotencyRef.current) {
      idempotencyRef.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `portal-${companyId}-${Date.now()}`;
    }

    const returnUrl = buildSaasPaymentReturnUrl(window.location.origin);

    try {
      const result = await createCheckout.mutateAsync({
        returnUrl,
        cancelUrl: returnUrl,
        idempotencyKey: idempotencyRef.current,
        expectedAmount,
        expectedCurrency: displayCurrency,
      });

      // Safety: amount already validated in mutation; refresh if URL missing
      if (!result.checkoutUrl) {
        void qc.invalidateQueries({ queryKey: WORKSPACE_BILLING_SUMMARY_KEY });
        throw new Error("CHECKOUT_URL_MISSING");
      }

      window.location.assign(result.checkoutUrl);
    } catch (err) {
      idempotencyRef.current = null;
      const code = err instanceof Error ? err.message : "CHECKOUT_FAILED";
      let message = t("companyWorkspace.payment.checkoutFailed", "Could not start payment. Please try again.");
      if (code === "CHECKOUT_AMOUNT_MISMATCH" || code === "CHECKOUT_CURRENCY_MISMATCH") {
        message = t(
          "companyWorkspace.payment.priceMismatch",
          "The payment amount changed. Refreshing billing details — please try again.",
        );
        void qc.invalidateQueries({ queryKey: WORKSPACE_BILLING_SUMMARY_KEY });
      } else if (code === "API_SERVER_NOT_CONFIGURED") {
        message = t("companyWorkspace.payment.apiMissing", "Payment API is not configured.");
      } else if (err instanceof Error && err.message && !err.message.startsWith("CHECKOUT_")) {
        // Prefer mapped server codes when present
        const serverCode = (err as Error & { code?: string }).code;
        if (serverCode === "FREE_PACKAGE_NO_PAYMENT") {
          message = t("companyWorkspace.payment.freePackage", "No payment required for this package.");
        } else if (serverCode === "CUSTOM_PRICING_REQUIRES_MANUAL_BILLING") {
          message = t(
            "companyWorkspace.payment.customPricing",
            "Contact billing — online payment is not available for custom pricing.",
          );
        } else if (serverCode === "NO_ONLINE_PROVIDER_CONFIGURED" || serverCode === "NOT_IMPLEMENTED") {
          message = t(
            "companyWorkspace.payment.providerUnavailable",
            "Online payment is temporarily unavailable. Please contact support.",
          );
        }
      }
      setLocalError(message);
      toast({ variant: "destructive", title: t("billing.toast.errorTitle"), description: message });
    }
  };

  const buttonLabel =
    eligibility.action === "renew"
      ? t("companyWorkspace.payment.renewNow", "Renew subscription")
      : t("companyWorkspace.payment.payNow", "Pay now");

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-background p-4">
      <h3 className="text-sm font-semibold">
        {t("companyWorkspace.payment.sectionTitle", "Online payment")}
      </h3>

      {isReturn ? (
        <div
          className="rounded-xl border border-border/80 bg-muted/30 px-3 py-2 text-sm"
          role="status"
          aria-live="polite"
        >
          {returnState === "confirmed" ? (
            <p>
              {t(
                "companyWorkspace.payment.returnConfirmed",
                "Payment confirmed. Your subscription details have been updated.",
              )}
            </p>
          ) : null}
          {returnState === "processing" ? (
            <p>
              {t(
                "companyWorkspace.payment.returnProcessing",
                "Payment started — waiting for confirmation. This page will update when settlement completes.",
              )}
            </p>
          ) : null}
          {returnState === "failed" ? (
            <p className="text-destructive">
              {t("companyWorkspace.payment.returnFailed", "Payment failed. You can try again.")}
            </p>
          ) : null}
          {returnState === "canceled" ? (
            <p>{t("companyWorkspace.payment.returnCanceled", "Payment was canceled.")}</p>
          ) : null}
          {returnState === "expired" ? (
            <p>{t("companyWorkspace.payment.returnExpired", "The payment session expired. Please try again.")}</p>
          ) : null}
          {returnState === "unknown" && isReturn ? (
            <p>
              {t(
                "companyWorkspace.payment.returnProcessing",
                "Payment started — waiting for confirmation. This page will update when settlement completes.",
              )}
            </p>
          ) : null}
        </div>
      ) : null}

      {eligibility.code === "FREE_PACKAGE" ? (
        <p className="text-sm text-muted-foreground">
          {t("companyWorkspace.payment.freePackage", "No payment required for this package.")}
        </p>
      ) : null}

      {eligibility.code === "CUSTOM_PRICING" ? (
        <p className="text-sm text-muted-foreground">
          {t(
            "companyWorkspace.payment.customPricing",
            "Contact billing — online payment is not available for custom pricing.",
          )}
        </p>
      ) : null}

      {eligibility.code === "PAYMENT_BLOCKED" || eligibility.code === "INVALID_SUBSCRIPTION_STATE" ? (
        <p className="text-sm text-muted-foreground">
          {t(eligibility.reasonKey, "Online payment is not available for this company right now.")}
        </p>
      ) : null}

      {(subscription.status === "past_due" || subscription.status === "grace_period") &&
      eligibility.allowed ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {t(
            "companyWorkspace.payment.recoveryHint",
            "Payment required to restore your subscription.",
          )}
        </p>
      ) : null}

      {subscription.status === "trialing" && eligibility.allowed ? (
        <p className="text-xs text-muted-foreground">
          {t(
            "companyWorkspace.payment.trialHint",
            "Paying converts your trial to a paid subscription after payment is confirmed.",
          )}
        </p>
      ) : null}

      {eligibility.allowed && expectedAmount != null && displayCurrency ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <p className="font-medium text-foreground">
              {formatBillingCurrency(expectedAmount, displayCurrency)}
            </p>
            <p className="text-xs text-muted-foreground">
              {t(
                "companyWorkspace.payment.amountHint",
                "Amount is locked by your current package and billing cycle.",
              )}
            </p>
          </div>
          <Button
            type="button"
            disabled={createCheckout.isPending}
            aria-busy={createCheckout.isPending}
            onClick={() => void handlePay()}
          >
            {createCheckout.isPending
              ? t("companyWorkspace.payment.starting", "Starting payment…")
              : buttonLabel}
          </Button>
        </div>
      ) : null}

      {eligibility.code === "UNAUTHORIZED" && canInitiate === false ? (
        <p className="text-xs text-muted-foreground">
          {t(
            "companyWorkspace.payment.unauthorized",
            "You can view billing details, but only a company administrator can start payment.",
          )}
        </p>
      ) : null}

      {localError ? <p className="text-sm text-destructive">{localError}</p> : null}
    </section>
  );
}
