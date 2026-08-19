import { AlertCircle, LogOut } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import { usePreferredLanguageSync } from "@/lib/i18n/use-preferred-language-sync";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { DashboardOutlet } from "@/components/dashboard/dashboard-outlet";
import { CustomerProfileProvider } from "@/context/customer-profile-context";
import { FirstTimeCompanyOnboardingGate } from "@/components/companies/first-time-company-onboarding-gate";
import { resolveTenantCompanyAccessBlock } from "@/lib/companies/company-access-state";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";

export default function DashboardApp() {
  const { t, i18n } = useTranslation("common");
  usePreferredLanguageSync();
  const [, setLocation] = useLocation();
  const { displayName, signOut, company } = useAuth();
  const { isSuperAdmin } = useAuthUser();
  const queryClient = useQueryClient();
  const isRtl = i18n.dir() === "rtl";
  const accessBlock = resolveTenantCompanyAccessBlock({
    isSuperAdmin,
    status: company?.status,
    approvalStatus: company?.approval_status,
    suspensionReason: company?.suspension_reason,
    rejectionReason: company?.approval_rejection_reason,
  });

  const handleLogout = async () => {
    await signOut();
    queryClient.clear();
    setLocation("~/login");
  };

  if (accessBlock) {
    const title =
      accessBlock.kind === "suspended"
        ? t("dashboard.companyAccess.suspendedTitle")
        : t("dashboard.companyAccess.rejectedTitle");
    const reasonLabel =
      accessBlock.kind === "suspended"
        ? t("dashboard.companyAccess.suspendedReason")
        : t("dashboard.companyAccess.rejectedReason");
    return (
      <div
        className="flex min-h-screen w-full items-center justify-center bg-background p-6 text-foreground"
        dir={isRtl ? "rtl" : "ltr"}
      >
        <div className="w-full max-w-lg space-y-4 rounded-2xl border border-rose-500/20 bg-rose-500/5 p-8 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-rose-400" />
          <h1 className="text-2xl font-bold">{title}</h1>
          {accessBlock.reason ? (
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {reasonLabel}: {accessBlock.reason}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {accessBlock.kind === "suspended"
                ? t("dashboard.companyAccess.suspendedFallback")
                : t("dashboard.companyAccess.rejectedFallback")}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{t("dashboard.companyAccess.contact")}</p>
          <Button variant="outline" className="border-white/10" onClick={handleLogout}>
            <LogOut className="me-2 h-4 w-4" />
            {t("buttons.signOut")}
          </Button>
        </div>
      </div>
    );
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
