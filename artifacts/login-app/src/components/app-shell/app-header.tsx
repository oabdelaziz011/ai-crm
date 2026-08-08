import { Menu, Search, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CompanyLogo } from "@/components/billing/identity/company-logo";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { useAuth } from "@/context/auth-context";
import { useAppShell } from "@/context/app-shell-context";
import { useFloatingAi } from "@/context/floating-ai-context";
import { AppBreadcrumbs } from "@/components/app-shell/app-breadcrumbs";
import { CommandPaletteTrigger } from "@/components/app-shell/command-palette";
import { UserMenu } from "@/components/app-shell/user-menu";
import { QueryRefreshIndicator } from "@/components/ui/query-refresh-indicator";
import { useResolvedCompanyLogos } from "@/hooks/company-workspace/use-company-brand-logos";
import { useCompanyIdentity } from "@/hooks/company-workspace/use-company-identity";
import { useAiPanel } from "@/hooks/floating-ai/use-ai-panel";
import { useHasPermission } from "@/hooks/use-rbac";
import { preloadFloatingAiAssistant } from "@/components/floating-ai/floating-ai-assistant";
import { cn } from "@/lib/utils";

type AppHeaderProps = {
  companyId: string | null;
  onSignOut: () => void;
  onActivateAi?: () => void;
};

export function AppHeader({ companyId, onSignOut, onActivateAi }: AppHeaderProps) {
  const { t } = useTranslation("common");
  const { isRefreshing } = useAuth();
  const { displayName, identity } = useCompanyIdentity(Boolean(companyId));
  const brandLogos = useResolvedCompanyLogos();
  const { setMobileSidebarOpen, openCommandPalette } = useAppShell();
  const canViewAi = useHasPermission("ai_chat.view");
  const { isPanelVisible, openPanel, closePanel } = useAiPanel();
  const { setPendingFocusOnOpen, consumePendingFocus } = useFloatingAi();

  const handleToggleAi = () => {
    onActivateAi?.();
    preloadFloatingAiAssistant();
    if (isPanelVisible) {
      closePanel();
      return;
    }
    setPendingFocusOnOpen(true);
    openPanel();
    requestAnimationFrame(() => consumePendingFocus());
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card/80 px-4 shadow-[0_1px_0_0_hsl(var(--border)/0.5),0_4px_24px_-4px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:gap-4 sm:px-6">
      <button
        type="button"
        onClick={() => setMobileSidebarOpen(true)}
        className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        aria-label={t("appShell.sidebar.openMenu")}
      >
        <Menu className="size-[18px]" aria-hidden="true" />
      </button>

      <div className="hidden min-w-0 items-center gap-2.5 md:flex md:max-w-[280px] lg:max-w-sm">
        {identity || companyId ? (
          <CompanyLogo
            name={displayName}
            logoUrl={brandLogos.primary ?? identity?.logoUrl}
            className="hidden size-8 shrink-0 lg:flex"
          />
        ) : null}
        <div className="min-w-0 flex-col justify-center">
          <AppBreadcrumbs />
          {identity?.name && (
            <p className="mt-0.5 truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
              {identity.name}
            </p>
          )}
        </div>
      </div>

      <div className="hidden min-w-0 flex-1 justify-center md:flex">
        <CommandPaletteTrigger />
      </div>

      <div className="flex flex-1 items-center justify-end gap-2 md:flex-none">
        <QueryRefreshIndicator active={isRefreshing} className="hidden sm:inline-flex" />

        <div className="flex h-12 items-center gap-0.5 rounded-xl border border-border bg-muted/30 px-1">
          <button
            type="button"
            onClick={openCommandPalette}
            className="flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
            aria-label={t("appShell.commandPalette.open")}
          >
            <Search className="size-4" aria-hidden="true" />
          </button>

          <NotificationBell companyId={companyId} />

          {canViewAi ? (
            <button
              type="button"
              onClick={handleToggleAi}
              className={cn(
                "flex size-10 items-center justify-center rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isPanelVisible
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
              )}
              aria-label={t("appShell.copilot.toggle")}
              aria-pressed={isPanelVisible}
            >
              <Sparkles className="size-4" aria-hidden="true" />
            </button>
          ) : null}

          <UserMenu onSignOut={onSignOut} />
        </div>
      </div>
    </header>
  );
}
