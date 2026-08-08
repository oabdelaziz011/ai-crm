import { lazy, Suspense, useEffect, type ReactNode, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { AppShellProvider } from "@/context/app-shell-context";
import { CompanyLocaleProvider } from "@/context/company-locale-context";
import { FloatingAiProvider } from "@/context/floating-ai-context";
import { AiTaskProvider } from "@/context/ai-task-context";
import {
  AppHeader,
  AppSidebar,
  CommandPalette,
} from "@/components/app-shell";
import { FloatingAiLauncher } from "@/components/floating-ai/floating-ai-launcher";
import { useCompanyBrandCenter } from "@/hooks/company-workspace/use-company-brand-center";
import { preloadLikelyNextRoute } from "@/lib/bundle/route-preloaders";
import { sectionIdFromNestedPath } from "@/config/dashboard-route-registry";

const FloatingAiAssistant = lazy(() =>
  import("@/components/floating-ai/floating-ai-assistant").then((m) => ({
    default: m.FloatingAiAssistant,
  })),
);

type DashboardLayoutProps = {
  children: ReactNode;
};

function DashboardLayoutInner({ children }: DashboardLayoutProps) {
  const { i18n } = useTranslation("common");
  const [location, setLocation] = useLocation();
  const { signOut, company } = useAuth();
  const queryClient = useQueryClient();
  const companyId = company?.id ?? null;
  // Shared company-branding cache — same key as CompanyBrandThemeBridge (no duplicate fetch).
  const brandQuery = useCompanyBrandCenter(companyId, Boolean(companyId));
  const brandThemeReady = !companyId || brandQuery.isFetched || brandQuery.isError;
  const isRtl = i18n.dir() === "rtl";
  const [floatingAiActive, setFloatingAiActive] = useState(false);
  const activateFloatingAi = useCallback(() => setFloatingAiActive(true), []);
  const activeSectionId = sectionIdFromNestedPath(location);
  const isOmnichannelConsole = /^\/omnichannel(?:\/|$)/i.test(location);

  useEffect(() => {
    preloadLikelyNextRoute(activeSectionId);
  }, [activeSectionId]);

  const handleSignOut = async () => {
    await signOut();
    queryClient.clear();
    setLocation("~/login");
  };

  if (!brandThemeReady) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center shell-canvas text-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading theme" />
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen w-full overflow-hidden shell-canvas text-foreground"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to main content
      </a>

      <AppSidebar />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AppHeader
          companyId={company?.id ?? null}
          onSignOut={handleSignOut}
          onActivateAi={activateFloatingAi}
        />

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <main
            id="main-content"
            className={
              isOmnichannelConsole
                ? "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden focus:outline-none"
                : "relative min-w-0 flex-1 overflow-y-auto focus:outline-none"
            }
          >
            {children}
          </main>
        </div>
      </div>

      <FloatingAiLauncher onActivate={activateFloatingAi} />
      {floatingAiActive && (
        <Suspense fallback={null}>
          <FloatingAiAssistant />
        </Suspense>
      )}

      <CommandPalette />
    </div>
  );
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <AppShellProvider>
      <CompanyLocaleProvider>
        <FloatingAiProvider>
          <AiTaskProvider>
            <DashboardLayoutInner>{children}</DashboardLayoutInner>
          </AiTaskProvider>
        </FloatingAiProvider>
      </CompanyLocaleProvider>
    </AppShellProvider>
  );
}
