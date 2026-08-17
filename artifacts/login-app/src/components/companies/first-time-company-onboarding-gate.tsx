import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { CompanyOnboardingWizard } from "@/components/companies/company-onboarding-wizard";
import { useAuth } from "@/context/auth-context";
import { useOnboardOwnCompany } from "@/hooks/companies/use-company-onboarding";
import { useToast } from "@/hooks/use-toast";
import {
  clearAwaitingCompanyMembership,
  clearCompanyOnboardingCompleted,
  clearPendingCompanyOnboarding,
  companyOnboardingValuesFromPayload,
  isAwaitingCompanyMembership,
  loadPendingCompanyOnboarding,
  markCompanyOnboardingCompleted,
  shouldOpenFirstTimeCompanyOnboarding,
  wasCompanyOnboardingJustCompleted,
  type CompanyOnboardingValues,
} from "@/lib/companies/onboarding";
import { persistPreferredLanguage } from "@/lib/i18n/persist-preferred-language";
import { resolveBootstrapAppLanguage } from "@/lib/i18n/resolve-app-language";
import { isPublicAuthPath, RESET_PASSWORD_PATH } from "@/lib/auth-redirect";

/**
 * Only for users who signed up but never got a company (e.g. email-confirm path).
 * Registration that already called onboard_own_company must NOT land here empty —
 * applyCompanyMembership + company_id + completed marker prevent that.
 */
export function FirstTimeCompanyOnboardingGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t, i18n } = useTranslation("common");
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const {
    user,
    profile,
    isLoading,
    isRefreshing,
    isSuperAdmin,
    refreshAuthContext,
    applyCompanyMembership,
  } = useAuth();
  const onboard = useOnboardOwnCompany();
  const onboardRef = useRef(onboard);
  onboardRef.current = onboard;
  const [wizardOpen, setWizardOpen] = useState(false);
  const [pendingBusy, setPendingBusy] = useState(false);
  const [wizardPrefill, setWizardPrefill] = useState<Partial<CompanyOnboardingValues> | null>(
    null,
  );
  const pendingTriedRef = useRef(false);
  const identityRecheckRef = useRef(false);

  const isSuperAdminUser = Boolean(isSuperAdmin || profile?.is_super_admin);
  const isIdentityPending = Boolean(user) && (isLoading || isRefreshing);

  const needsOnboarding = shouldOpenFirstTimeCompanyOnboarding({
    isAuthLoading: isLoading,
    isIdentityPending,
    isAuthenticated: Boolean(user),
    companyId: profile?.company_id ?? null,
    isSuperAdmin: isSuperAdminUser,
  });

  useEffect(() => {
    if (!profile?.company_id) return;
    clearPendingCompanyOnboarding();
    clearAwaitingCompanyMembership();
    clearCompanyOnboardingCompleted();
    pendingTriedRef.current = false;
    identityRecheckRef.current = false;
    setWizardOpen(false);
    setPendingBusy(false);
    setWizardPrefill(null);
  }, [profile?.company_id]);

  useEffect(() => {
    if (!needsOnboarding) {
      setWizardOpen(false);
      setPendingBusy(false);
      return;
    }
    if (isPublicAuthPath(location) || location === RESET_PASSWORD_PATH) {
      return;
    }

    // Register just finished successfully — never flash a second empty wizard while
    // profile.company_id catches up from the server.
    if (wasCompanyOnboardingJustCompleted()) {
      setWizardOpen(false);
      if (!identityRecheckRef.current) {
        identityRecheckRef.current = true;
        setPendingBusy(true);
        void refreshAuthContext().finally(() => {
          setPendingBusy(false);
        });
      }
      return;
    }

    const pending = loadPendingCompanyOnboarding();
    if (pending) {
      setWizardPrefill(companyOnboardingValuesFromPayload(pending));
    }

    // Auto-finish from registration / email-confirm draft — never flash empty form first.
    if (pending && !pendingTriedRef.current) {
      pendingTriedRef.current = true;
      setPendingBusy(true);
      setWizardOpen(false);
      void (async () => {
        try {
          const lang = resolveBootstrapAppLanguage();
          await persistPreferredLanguage(lang);
          await i18n.changeLanguage(lang);
        } catch {
          /* best-effort */
        }
        try {
          const result = await onboardRef.current.mutateAsync(pending);
          applyCompanyMembership({
            companyId: result.companyId,
            companyName: result.company?.name ?? pending.name,
          });
          clearPendingCompanyOnboarding();
          clearAwaitingCompanyMembership();
          markCompanyOnboardingCompleted();
          await refreshAuthContext();
          toast({
            title: t("auth.register.successTitle"),
            description: t("auth.register.successOnboardingDescription", {
              defaultValue: "Your account and company are ready.",
            }),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (message === "company_already_assigned") {
            clearPendingCompanyOnboarding();
            clearAwaitingCompanyMembership();
            markCompanyOnboardingCompleted();
            await refreshAuthContext();
            return;
          }
          // Keep draft; open wizard prefilled so the user does not retype everything.
          clearAwaitingCompanyMembership();
          setWizardOpen(true);
        } finally {
          setPendingBusy(false);
        }
      })();
      return;
    }

    if (pending) {
      setWizardOpen(true);
      return;
    }

    // No draft yet — re-check membership once before opening a blank wizard.
    if (!identityRecheckRef.current) {
      identityRecheckRef.current = true;
      setPendingBusy(true);
      setWizardOpen(false);
      void refreshAuthContext().finally(() => {
        setPendingBusy(false);
      });
      return;
    }

    if (isAwaitingCompanyMembership()) {
      clearAwaitingCompanyMembership();
    }
    setWizardPrefill(null);
    setWizardOpen(true);
  }, [
    needsOnboarding,
    location,
    refreshAuthContext,
    applyCompanyMembership,
    t,
    toast,
    i18n,
  ]);

  if (Boolean(user) && (isLoading || isRefreshing) && !profile?.company_id && !isSuperAdminUser) {
    if (isPublicAuthPath(location) || location === RESET_PASSWORD_PATH) {
      return <>{children}</>;
    }
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!needsOnboarding) {
    return <>{children}</>;
  }

  if (isPublicAuthPath(location) || location === RESET_PASSWORD_PATH) {
    return <>{children}</>;
  }

  return (
    <>
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <div>
          <p className="text-base font-semibold">{t("companyOnboarding.gateTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {pendingBusy
              ? t("auth.register.finishingCompany", {
                  defaultValue: "Finishing your company setup…",
                })
              : t("companyOnboarding.gateBody")}
          </p>
        </div>
      </div>
      <CompanyOnboardingWizard
        open={wizardOpen && !pendingBusy}
        mode="first_time"
        initialValues={wizardPrefill ?? undefined}
        onOpenChange={() => {
          /* first-time cannot dismiss without completing */
        }}
        onCompleted={async (company) => {
          applyCompanyMembership({
            companyId: company.id,
            companyName: company.name,
          });
          clearPendingCompanyOnboarding();
          clearAwaitingCompanyMembership();
          markCompanyOnboardingCompleted();
          await refreshAuthContext();
          setWizardOpen(false);
          if (!location.startsWith("/dashboard")) {
            setLocation("/dashboard");
          }
        }}
      />
    </>
  );
}
