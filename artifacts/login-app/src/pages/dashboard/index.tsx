import { useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import { usePreferredLanguageSync } from "@/lib/i18n/use-preferred-language-sync";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { DashboardOutlet } from "@/components/dashboard/dashboard-outlet";
import { CustomerProfileProvider } from "@/context/customer-profile-context";
import { FirstTimeCompanyOnboardingGate } from "@/components/companies/first-time-company-onboarding-gate";
import { CompanyAccessLockScreen } from "@/components/companies/company-access-lock-screen";
import { resolveTenantCompanyAccessBlock } from "@/lib/companies/company-access-state";

export default function DashboardApp() {
  usePreferredLanguageSync();
  const { company, refreshAuthContext } = useAuth();
  const { isSuperAdmin } = useAuthUser();
  const accessBlock = resolveTenantCompanyAccessBlock({
    isSuperAdmin,
    status: company?.status,
    approvalStatus: company?.approval_status,
    suspensionReason: company?.suspension_reason,
    rejectionReason: company?.approval_rejection_reason,
  });

  // Already-logged-in users: refresh company access when the tab becomes visible
  // so Suspended (subscription ended) locks without requiring a full re-login.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshAuthContext();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(() => {
      void refreshAuthContext();
    }, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, [refreshAuthContext]);

  if (accessBlock) {
    return <CompanyAccessLockScreen accessBlock={accessBlock} />;
  }

  return (
    <FirstTimeCompanyOnboardingGate>
      <CustomerProfileProvider>
        <DashboardLayout>
          <DashboardOutlet />
        </DashboardLayout>
      </CustomerProfileProvider>
    </FirstTimeCompanyOnboardingGate>
  );
}
