import { Menu, Search, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { useAuth } from "@/context/auth-context";
import { useAppShell } from "@/context/app-shell-context";
import { AppBreadcrumbs } from "@/components/app-shell/app-breadcrumbs";
import { CommandPaletteTrigger } from "@/components/app-shell/command-palette";
import { UserMenu } from "@/components/app-shell/user-menu";
import { QueryRefreshIndicator } from "@/components/ui/query-refresh-indicator";
import { cn } from "@/lib/utils";

type AppHeaderProps = {
  companyId: string | null;
  onSignOut: () => void;
};

export function AppHeader({ companyId, onSignOut }: AppHeaderProps) {
  const { t } = useTranslation("common");
  const { company, isRefreshing } = useAuth();
  const { setMobileSidebarOpen, toggleCopilot, copilotOpen, openCommandPalette } = useAppShell();

  return (
    <header className="relative z-10 flex h-16 shrink-0 items-center gap-4 border-b border-border bg-card/70 px-4 shadow-[0_1px_0_0_hsl(var(--border)/0.5),0_4px_24px_-4px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:px-6">
      <button
        type="button"
        onClick={() => setMobileSidebarOpen(true)}
        className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        aria-label={t("appShell.sidebar.openMenu")}
      >
        <Menu className="size-[18px]" aria-hidden="true" />
      </button>

      <div className="hidden min-w-0 flex-col justify-center md:flex md:max-w-[240px] lg:max-w-xs">
        <AppBreadcrumbs />
        {company?.name && (
          <p className="mt-0.5 truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
            {company.name}
          </p>
        )}
      </div>

      <div className="hidden min-w-0 flex-1 justify-center md:flex">
        <CommandPaletteTrigger />
      </div>

      <div className="flex flex-1 items-center justify-end gap-2 md:flex-none">
        <QueryRefreshIndicator active={isRefreshing} className="hidden sm:inline-flex" />
        <button
          type="button"
          onClick={openCommandPalette}
          className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          aria-label={t("appShell.commandPalette.open")}
        >
          <Search className="size-4" aria-hidden="true" />
        </button>

        <div className="flex items-center gap-0.5 rounded-xl border border-border bg-muted/30 p-1">
          <button
            type="button"
            onClick={toggleCopilot}
            className={cn(
              "hidden size-8 items-center justify-center rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:flex",
              copilotOpen
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
            aria-label={t("appShell.copilot.toggle")}
            aria-pressed={copilotOpen}
          >
            <Sparkles className="size-4" aria-hidden="true" />
          </button>

          <NotificationBell companyId={companyId} />

          <UserMenu onSignOut={onSignOut} />
        </div>
      </div>
    </header>
  );
}
