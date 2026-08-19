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
  assignedAmount?: number | null;
  listAmount?: number | null;
  onlineCheckoutAllowed?: boolean;
  approvalStatus?: string | null;
  payableSource?: string | null;
  discountPercent?: number | null;
  preApprovalPaid?: boolean;
  paymentPortalState?: string | null;
};

export function CompanySaasPaymentPanel({
  companyId,
  subscription,
  plan,
  currency,
  assignedAmount,
  listAmount,
  onlineCheckoutAllowed = true,
  approvalStatus,
  payableSource,
  discountPercent,
  preApprovalPaid = false,
  paymentPortalState,
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

  const resolvedApproval =
    approvalStatus ?? company?.approval_status ?? subscription.company?.approval_status;
  const canInitiate = canInitiateCompanyOnlinePayment({ hasPermission, isSuperAdmin });
  const eligibility = useMemo(
    () =>
      resolveSaasPaymentEligibility({
        canInitiate,
        companyId,
        companyStatus: company?.status ?? subscription.company?.status,
        approvalStatus: resolvedApproval,
        subscription,
        plan,
        payableAmount: assignedAmount,
        payableSource,
        onlineCheckoutAllowed,
        preApprovalPaid,
      }),
    [
      assignedAmount,
      canInitiate,
      company,
      companyId,
      onlineCheckoutAllowed,
      payableSource,
      plan,
      preApprovalPaid,
      resolvedApproval,
      subscription,
    ],
  );

  const catalogAmount = expectedListPriceAmount(subscription, plan);
  const displayAmount = assignedAmount ?? catalogAmount;
  const displayCurrency = currency ?? null;
  const portalState =
    paymentPortalState ??
    (eligibility.code === "AWAITING_APPROVAL"
      ? "awaiting_approval"
      : eligibility.code === "NOT_CONFIGURED"
        ? "not_configured"
        : resolvedApproval === "pending" && eligibility.allowed
          ? "payment_required"
          : "standard");
  const checkoutAllowed =
    eligibility.allowed && onlineCheckoutAllowed && portalState !== "awaiting_approval";

  const params = useMemo(() => new URLSearchParams(search), [search]);
  const isReturn = params.get("payment_return") === "1";
  const returnQuery = useSaasCheckoutReturnSession(isReturn);
  const returnState = derivePortalPaymentReturnState(returnQuery.data ?? null);

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
    if (!checkoutAllowed || displayAmount == null || !displayCurrency) {
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
        expectedAmount: displayAmount,
        expectedCurrency: displayCurrency,
      });

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
        const serverCode = (err as Error & { code?: string }).code;
        if (serverCode === "FREE_PACKAGE_NO_PAYMENT") {
          message = t("companyWorkspace.payment.freePackage", "No payment required for this package.");
        } else if (serverCode === "CUSTOM_PRICING_REQUIRES_MANUAL_BILLING") {
          message = t(
            "companyWorkspace.payment.customPricing",
            "Contact billing — online payment is not available for custom pricing.",
          );
        } else if (serverCode === "UNAUTHORIZED_CHECKOUT") {
          message = t(
            "companyWorkspace.payment.unauthorized",
            "You can view billing details, but only a company administrator can start payment.",
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

  const planLabel = plan?.display_name || plan?.name || t("billing.plan.unassigned", "Unassigned");
  const cycleLabel = subscription.billing_cycle;

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-background p-4">
      <h3 className="text-sm font-semibold">
        {portalState === "payment_required"
          ? t("companyWorkspace.payment.paymentRequired", "Payment Required")
          : t("companyWorkspace.payment.sectionTitle", "Online payment")}
      </h3>

      {isReturn ? (
        <div
          className="rounded-xl border border-border/80 bg-muted/30 px-3 py-2 text-sm"
          role="status"
          aria-live="polite"
        >
          {returnState === "confirmed" && portalState === "awaiting_approval" ? (
            <p>
              {t("companyWorkspace.payment.paymentReceived", "Payment received")}
              {". "}
              {t("companyWorkspace.payment.awaitingApproval", "Awaiting company approval")}
            </p>
          ) : null}
          {returnState === "confirmed" && portalState !== "awaiting_approval" ? (
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

      {portalState === "awaiting_approval" ? (
        <div className="space-y-1 text-sm">
          <p className="font-medium text-foreground">
            {t("companyWorkspace.payment.paymentReceived", "Payment received")}
          </p>
          <p className="text-muted-foreground">
            {t("companyWorkspace.payment.awaitingApproval", "Awaiting company approval")}
          </p>
        </div>
      ) : null}

      {portalState === "not_configured" ? (
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>{t("companyWorkspace.payment.notConfigured", "Payment is not available yet.")}</p>
          <p>
            {t(
              "companyWorkspace.payment.configurationPending",
              "Your commercial configuration is still being prepared.",
            )}
          </p>
        </div>
      ) : null}

      {eligibility.code === "FREE_PACKAGE" ? (
        <p className="text-sm text-muted-foreground">
          {t("companyWorkspace.payment.freePackage", "No payment required for this package.")}
        </p>
      ) : null}

      {eligibility.code === "CUSTOM_PRICING" && portalState === "standard" ? (
        <p className="text-sm text-muted-foreground">
          {t(
            "companyWorkspace.payment.customPricing",
            "Contact billing — online payment is not available for custom pricing.",
          )}
        </p>
      ) : null}

      {(eligibility.code === "PAYMENT_BLOCKED" || eligibility.code === "INVALID_SUBSCRIPTION_STATE") &&
      portalState === "standard" ? (
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

      {subscription.status === "trialing" &&
      eligibility.allowed &&
      resolvedApproval !== "pending" ? (
        <p className="text-xs text-muted-foreground">
          {t(
            "companyWorkspace.payment.trialHint",
            "Paying converts your trial to a paid subscription after payment is confirmed.",
          )}
        </p>
      ) : null}

      {portalState !== "not_configured" &&
      portalState !== "awaiting_approval" &&
      displayAmount != null &&
      displayCurrency ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1 text-sm">
            {portalState === "payment_required" ? (
              <>
                <p className="text-xs text-muted-foreground">
                  {t("companyWorkspace.payment.planLabel", "Plan")}: {planLabel}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("companyWorkspace.payment.billingCycle", "Billing cycle")}: {cycleLabel}
                </p>
              </>
            ) : null}
            {listAmount != null && listAmount !== displayAmount ? (
              <p className="text-xs text-muted-foreground">
                {t("companyWorkspace.payment.listPriceHint", "List price")}:{" "}
                {formatBillingCurrency(listAmount, displayCurrency)}
              </p>
            ) : null}
            {payableSource === "discount" && discountPercent != null ? (
              <p className="text-xs text-muted-foreground">
                {t("companyWorkspace.payment.discountHint", "Company discount")}: {discountPercent}%
              </p>
            ) : null}
            <p className="font-medium text-foreground">
              {t("companyWorkspace.payment.companyPrice", "Company price")}:{" "}
              {formatBillingCurrency(displayAmount, displayCurrency)}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("companyWorkspace.payment.totalDue", "Total due")}:{" "}
              {formatBillingCurrency(displayAmount, displayCurrency)}
            </p>
          </div>
          {checkoutAllowed && displayAmount != null ? (
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
          ) : null}
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
