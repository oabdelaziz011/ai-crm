import { AlertCircle, LogOut } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import { usePreferredLanguageSync } from "@/lib/i18n/use-preferred-language-sync";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { DashboardOutlet } from "@/components/dashboard/dashboard-outlet";
import { CustomerProfileProvider } from "@/context/customer-profile-context";
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
  const isSuspendedCompany = !isSuperAdmin && company?.status === "Suspended";

  const handleLogout = async () => {
    await signOut();
    queryClient.clear();
    setLocation("~/login");
  };

  if (isSuspendedCompany) {
    return (
      <div
        className="min-h-screen w-full bg-background text-foreground flex items-center justify-center p-6"
        dir={isRtl ? "rtl" : "ltr"}
      >
        <div className="w-full max-w-lg rounded-2xl border border-rose-500/20 bg-rose-500/5 p-8 text-center space-y-4">
          <AlertCircle className="w-10 h-10 mx-auto text-rose-400" />
          <h1 className="text-2xl font-bold">{t("dashboard.suspended.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("dashboard.suspended.description")}</p>
          <p className="text-xs text-muted-foreground">{t("dashboard.suspended.contact")}</p>
          <Button variant="outline" className="border-white/10" onClick={handleLogout}>
            <LogOut className="w-4 h-4 me-2" />
            {t("buttons.signOut")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <CustomerProfileProvider>
      <DashboardLayout>
        <DashboardOutlet />
      </DashboardLayout>
    </CustomerProfileProvider>
  );
}
