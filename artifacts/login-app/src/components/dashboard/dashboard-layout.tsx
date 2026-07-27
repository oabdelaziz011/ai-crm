import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { AppShellProvider } from "@/context/app-shell-context";
import { FloatingAiProvider } from "@/context/floating-ai-context";
import { AiTaskProvider } from "@/context/ai-task-context";
import {
  AppHeader,
  AppSidebar,
  CommandPalette,
} from "@/components/app-shell";
import { preloadFloatingAiAssistant } from "@/components/floating-ai";

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
  const [, setLocation] = useLocation();
  const { signOut, company, profile } = useAuth();
  const queryClient = useQueryClient();
  const isRtl = i18n.dir() === "rtl";

  useEffect(() => {
    if (profile?.id) {
      preloadFloatingAiAssistant();
    }
  }, [profile?.id]);

  const handleSignOut = async () => {
    await signOut();
    queryClient.clear();
    setLocation("~/login");
  };

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
        <AppHeader companyId={company?.id ?? null} onSignOut={handleSignOut} />

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <main id="main-content" className="relative min-w-0 flex-1 overflow-y-auto focus:outline-none">
            {children}
          </main>
        </div>
      </div>

      <Suspense fallback={null}>
        <FloatingAiAssistant />
      </Suspense>

      <CommandPalette />
    </div>
  );
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <AppShellProvider>
      <FloatingAiProvider>
        <AiTaskProvider>
          <DashboardLayoutInner>{children}</DashboardLayoutInner>
        </AiTaskProvider>
      </FloatingAiProvider>
    </AppShellProvider>
  );
}
