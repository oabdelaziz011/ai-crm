import { AlertCircle, LogOut } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { CompanySaasPaymentPanel } from "@/components/company-workspace/company-saas-payment-panel";
import { CompanyLocaleProvider } from "@/context/company-locale-context";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import { useCompanySubscription } from "@/hooks/billing/use-company-subscriptions";
import { useCompanyLocale } from "@/hooks/use-company-locale";
import { isSaasUnpaidRecoveryStatus } from "@/lib/billing/saas-payment-eligibility";
import type { TenantCompanyAccessBlock } from "@/lib/companies/company-access-state";
import { canInitiateCompanyOnlinePayment } from "@/lib/company-workspace/permissions";

type CompanyAccessLockScreenProps = {
  accessBlock: TenantCompanyAccessBlock;
};

function CompanyAccessLockScreenInner({ accessBlock }: CompanyAccessLockScreenProps) {
  const { t, i18n } = useTranslation("common");
  const [, setLocation] = useLocation();
  const { company, signOut, refreshAuthContext } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const queryClient = useQueryClient();
  const isRtl = i18n.dir() === "rtl";
  const companyId = company?.id ?? null;
  const canPay = canInitiateCompanyOnlinePayment({ hasPermission, isSuperAdmin });
  const subscriptionQuery = useCompanySubscription(
    companyId,
    accessBlock.kind === "suspended" && Boolean(companyId),
  );
  const { currency } = useCompanyLocale();

  const subscription = subscriptionQuery.data ?? null;
  // Prefer companies.subscription_status while locked — React Query may still hold
  // a stale "active" row from before the company was Suspended mid-session.
  const recoveryStatus =
    company?.subscription_status ?? subscription?.status ?? null;
  const isUnpaidRecovery =
    accessBlock.kind === "suspended" && isSaasUnpaidRecoveryStatus(recoveryStatus);

  useEffect(() => {
    if (accessBlock.kind !== "suspended" || !companyId) return;
    void queryClient.invalidateQueries({
      queryKey: ["billing", "company-subscriptions", companyId],
    });
  }, [accessBlock.kind, companyId, queryClient]);

  useEffect(() => {
    if (!isUnpaidRecovery) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment_return") !== "1") return;
    void (async () => {
      await refreshAuthContext();
      void queryClient.invalidateQueries({ queryKey: ["billing"] });
    })();
  }, [isUnpaidRecovery, queryClient, refreshAuthContext]);

  const handleLogout = async () => {
    await signOut();
    queryClient.clear();
    setLocation("~/login");
  };

  const title =
    accessBlock.kind === "suspended"
      ? isUnpaidRecovery
        ? t("dashboard.companyAccess.subscriptionEndedTitle")
        : t("dashboard.companyAccess.suspendedTitle")
      : t("dashboard.companyAccess.rejectedTitle");

  const reasonLabel =
    accessBlock.kind === "suspended"
      ? t("dashboard.companyAccess.suspendedReason")
      : t("dashboard.companyAccess.rejectedReason");

  const fallback =
    accessBlock.kind === "suspended"
      ? isUnpaidRecovery
        ? t("dashboard.companyAccess.subscriptionEndedFallback")
        : t("dashboard.companyAccess.suspendedFallback")
      : t("dashboard.companyAccess.rejectedFallback");

  return (
    <div
      className="flex min-h-screen w-full items-center justify-center bg-background p-6 text-foreground"
      dir={isRtl ? "rtl" : "ltr"}
      data-testid="company-access-lock-screen"
    >
      <div className="w-full max-w-xl space-y-4 rounded-2xl border border-rose-500/20 bg-rose-500/5 p-8 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-rose-400" />
        <h1 className="text-2xl font-bold">{title}</h1>
        {accessBlock.reason ? (
          <p className="whitespace-pre-wrap text-sm text-foreground">
            {reasonLabel}: {accessBlock.reason}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{fallback}</p>
        )}

        {accessBlock.kind === "suspended" && isUnpaidRecovery ? (
          canPay && subscription && isSaasUnpaidRecoveryStatus(subscription.status) ? (
            <div className="space-y-3 text-start">
              <p className="text-sm text-muted-foreground">
                {t("dashboard.companyAccess.renewHintAdmin")}
              </p>
              <CompanySaasPaymentPanel
                companyId={companyId!}
                subscription={subscription}
                plan={subscription.plan}
                currency={currency}
                paymentPortalState="payment_required"
              />
            </div>
          ) : canPay && subscriptionQuery.isFetching ? (
            <p className="text-sm text-muted-foreground">
              {t("dashboard.companyAccess.renewHintAdmin")}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("dashboard.companyAccess.renewHintStaff")}
            </p>
          )
        ) : (
          <p className="text-xs text-muted-foreground">{t("dashboard.companyAccess.contact")}</p>
        )}

        <Button variant="outline" className="border-white/10" onClick={handleLogout}>
          <LogOut className="me-2 h-4 w-4" />
          {t("buttons.signOut")}
        </Button>
      </div>
    </div>
  );
}

/**
 * Full-screen gate when companies.status is Suspended (or rejected).
 * For unpaid-clock suspensions, billing admins can renew from this screen.
 */
export function CompanyAccessLockScreen(props: CompanyAccessLockScreenProps) {
  return (
    <CompanyLocaleProvider>
      <CompanyAccessLockScreenInner {...props} />
    </CompanyLocaleProvider>
  );
}
