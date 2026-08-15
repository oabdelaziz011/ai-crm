import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { CompanyOnboardingWizard } from "@/components/companies/company-onboarding-wizard";
import { useAuth } from "@/context/auth-context";
import { useOnboardOwnCompany } from "@/hooks/companies/use-company-onboarding";
import { useToast } from "@/hooks/use-toast";
import {
  clearPendingCompanyOnboarding,
  loadPendingCompanyOnboarding,
  shouldOpenFirstTimeCompanyOnboarding,
} from "@/lib/companies/onboarding";
import { isPublicAuthPath, RESET_PASSWORD_PATH } from "@/lib/auth-redirect";

/**
 * Blocks the authenticated shell until a company-less user completes onboarding.
 * Super-admins and users who already have a company are never gated.
 * If registration stored a pending company payload (email confirmation path),
 * apply it automatically before opening the interactive wizard.
 */
export function FirstTimeCompanyOnboardingGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const { user, profile, isLoading, isRefreshing, isSuperAdmin, refreshAuthContext } = useAuth();
  const onboard = useOnboardOwnCompany();
  const onboardRef = useRef(onboard);
  onboardRef.current = onboard;
  const [wizardOpen, setWizardOpen] = useState(false);
  const [pendingBusy, setPendingBusy] = useState(false);
  const pendingTriedRef = useRef(false);

  const isSuperAdminUser = Boolean(isSuperAdmin || profile?.is_super_admin);
  // SIGNED_IN loads profile in background — wait so existing tenants don't flash onboarding.
  const isIdentityPending = Boolean(user) && (isLoading || isRefreshing);

  const needsOnboarding = shouldOpenFirstTimeCompanyOnboarding({
    isAuthLoading: isLoading,
    isIdentityPending,
    isAuthenticated: Boolean(user),
    companyId: profile?.company_id ?? null,
    isSuperAdmin: isSuperAdminUser,
  });

  useEffect(() => {
    if (profile?.company_id) {
      clearPendingCompanyOnboarding();
    }
  }, [profile?.company_id]);

  useEffect(() => {
    if (!needsOnboarding) {
      setWizardOpen(false);
      setPendingBusy(false);
      pendingTriedRef.current = false;
      return;
    }
    if (isPublicAuthPath(location) || location === RESET_PASSWORD_PATH) {
      return;
    }

    const pending = loadPendingCompanyOnboarding();
    if (pending && !pendingTriedRef.current) {
      pendingTriedRef.current = true;
      setPendingBusy(true);
      void onboardRef.current
        .mutateAsync(pending)
        .then(async () => {
          clearPendingCompanyOnboarding();
          await refreshAuthContext();
          toast({
            title: t("auth.register.successTitle"),
            description: t("auth.register.successOnboardingDescription", {
              defaultValue: "Your account and company are ready.",
            }),
          });
          if (!location.startsWith("/dashboard")) {
            setLocation("/dashboard");
          }
        })
        .catch(() => {
          clearPendingCompanyOnboarding();
          setWizardOpen(true);
        })
        .finally(() => {
          setPendingBusy(false);
        });
      return;
    }

    if (!pending) {
      setWizardOpen(true);
    }
  }, [needsOnboarding, location, refreshAuthContext, setLocation, t, toast]);

  // Still resolving membership after login — keep shell calm (no onboarding flash).
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
        onOpenChange={() => {
          /* first-time cannot dismiss without completing */
        }}
        onCompleted={async () => {
          clearPendingCompanyOnboarding();
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
