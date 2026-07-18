import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { ChevronRight, Hash } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { NotificationsBell } from "@/components/dashboard/notifications-bell";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import {
  getDashboardRouteById,
  sectionIdFromNestedPath,
} from "@/config/dashboard-route-registry";
import { isDashboardHomeNestedPath } from "@/lib/dashboard-home";
import { useTranslation } from "react-i18next";

type DashboardLayoutProps = {
  children: ReactNode;
};

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { t, i18n } = useTranslation("common");
  const [nestedLocation, setLocation] = useLocation();
  const { displayName, signOut, company } = useAuth();
  const queryClient = useQueryClient();
  const isRtl = i18n.dir() === "rtl";
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const activeSectionId = sectionIdFromNestedPath(nestedLocation);
  const activeTitleKey = isDashboardHomeNestedPath(nestedLocation)
    ? "navigation.home"
    : activeSectionId
      ? getDashboardRouteById(activeSectionId).titleKey
      : "navigation.home";

  const handleSignOut = async () => {
    await signOut();
    queryClient.clear();
    setLocation("~/login");
  };

  return (
    <div
      className="min-h-screen w-full bg-background text-foreground flex overflow-hidden"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <DashboardSidebar
        sidebarOpen={sidebarOpen}
        onNavigate={() => setSidebarOpen(false)}
        onSignOut={handleSignOut}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 border-b border-white/5 bg-black/30 backdrop-blur-md flex items-center px-6 gap-4 shrink-0">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            <Hash className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("dashboard.breadcrumbs.root")}</span>
            <ChevronRight
              className={`w-3.5 h-3.5 text-muted-foreground ${isRtl ? "rotate-180" : ""}`}
            />
            <span className="font-medium text-foreground">{t(activeTitleKey)}</span>
          </div>
          <div className="ms-auto flex items-center gap-3">
            <NotificationsBell companyId={company?.id ?? null} />
            <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center text-primary text-xs font-bold">
              {displayName.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}
