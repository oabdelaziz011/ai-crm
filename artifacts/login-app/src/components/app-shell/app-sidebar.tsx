import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  ChevronDown,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CompanyLogo } from "@/components/billing/identity/company-logo";
import { UserAvatar } from "@/components/profile/user-avatar";
import { usePlatformFeatureEnabledLookup } from "@/hooks/platform-ai/use-platform-ai-feature-enabled";
import { useResolvedCompanyLogos } from "@/hooks/company-workspace/use-company-brand-logos";
import { useCompanyIdentity } from "@/hooks/company-workspace/use-company-identity";
import { useCurrentUserAvatar } from "@/hooks/use-current-user-avatar";
import { useAuthUser } from "@/hooks/use-rbac";
import { useSidebarBadgeCounts } from "@/hooks/use-sidebar-badge-counts";
import { pickChromeLogo } from "@/lib/company-workspace/brand-center/resolve-brand-logos";
import { useTranslation } from "react-i18next";
import {
  DASHBOARD_SIDEBAR_GROUPS,
  DASHBOARD_SIDEBAR_ORDER,
  getDashboardRouteById,
  isDashboardRoutePermitted,
  sectionIdFromNestedPath,
  type DashboardSectionId,
  type DashboardSidebarGroupId,
} from "@/config/dashboard-route-registry";
import { preloadDashboardRoute } from "@/lib/bundle/route-preloaders";
import { isDashboardHomeNestedPath } from "@/lib/dashboard-home";
import { useAppShell } from "@/context/app-shell-context";
import { cn } from "@/lib/utils";

type AppSidebarProps = {
  className?: string;
};

type SidebarSectionKey = "intelligence" | "operations" | "administration" | "access";

function sectionLabelForEntry(
  entry: (typeof DASHBOARD_SIDEBAR_ORDER)[number],
): SidebarSectionKey | null {
  if (entry.type === "group" && entry.id === "ai-platform") return "intelligence";
  if (entry.type === "route" && entry.id === "customers") return "operations";
  if (entry.type === "route" && entry.id === "companies") return "administration";
  if (entry.type === "group" && entry.id === "user-management") return "access";
  return null;
}

export const AppSidebar = memo(function AppSidebar({ className }: AppSidebarProps) {
  const { t, i18n } = useTranslation("common");
  const [location, setLocation] = useLocation();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const { displayName, identity } = useCompanyIdentity();
  const { name: userName } = useCurrentUserAvatar();
  const { resolvedTheme } = useTheme();
  const brandLogos = useResolvedCompanyLogos();
  const chromeLogo = pickChromeLogo(brandLogos, {
    theme: resolvedTheme === "dark" ? "dark" : "light",
    collapsed: false,
  });
  const compactLogo = pickChromeLogo(brandLogos, {
    theme: resolvedTheme === "dark" ? "dark" : "light",
    collapsed: true,
  });
  const platformFeatureEnabled = usePlatformFeatureEnabledLookup();
  const isRtl = i18n.dir() === "rtl";
  const {
    sidebarCollapsed,
    toggleSidebarCollapsed,
    mobileSidebarOpen,
    setMobileSidebarOpen,
  } = useAppShell();

  const activeSectionId = sectionIdFromNestedPath(location);
  const isHomeActive = isDashboardHomeNestedPath(location);

  const [groupOpen, setGroupOpen] = useState<Record<DashboardSidebarGroupId, boolean>>({
    "ai-platform": false,
    "user-management": false,
  });

  useEffect(() => {
    for (const group of DASHBOARD_SIDEBAR_GROUPS) {
      const isActive = group.childIds.some((id) => id === activeSectionId);
      if (isActive) {
        setGroupOpen((prev) => ({ ...prev, [group.id]: true }));
      }
    }
  }, [activeSectionId]);

  const badgePermissions = useMemo(
    () => ({
      customers: isDashboardRoutePermitted(
        getDashboardRouteById("customers"),
        isSuperAdmin,
        hasPermission,
      ),
      bookings: isDashboardRoutePermitted(
        getDashboardRouteById("bookings"),
        isSuperAdmin,
        hasPermission,
      ),
      invoices: isDashboardRoutePermitted(
        getDashboardRouteById("invoices"),
        isSuperAdmin,
        hasPermission,
      ),
    }),
    [hasPermission, isSuperAdmin],
  );

  const sidebarBadges = useSidebarBadgeCounts(badgePermissions);

  const badgeCounts: Partial<Record<DashboardSectionId, number>> = {
    customers: sidebarBadges.customers,
    bookings: sidebarBadges.bookings,
    invoices: sidebarBadges.invoices,
  };

  const navigate = useCallback(
    (nestedPath: string) => {
      setLocation(nestedPath);
      setMobileSidebarOpen(false);
    },
    [setLocation, setMobileSidebarOpen],
  );

  const navItemClasses = (active: boolean, collapsed: boolean) =>
    cn(
      "group relative flex w-full items-center gap-3 rounded-lg text-[13px] font-medium transition-all duration-150",
      collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2",
      active
        ? collapsed
          ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-primary/20"
          : "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm shadow-primary/15"
        : "text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground",
    );

  const renderNavItem = (sectionId: DashboardSectionId, indented = false) => {
    const route = getDashboardRouteById(sectionId);
    if (!isDashboardRoutePermitted(route, isSuperAdmin, hasPermission, platformFeatureEnabled)) return null;

    const active = activeSectionId === sectionId;
    const badge = badgeCounts[sectionId];
    const Icon = route.icon;
    const label = t(route.titleKey);
    const collapsed = sidebarCollapsed && !indented;

    const button = (
      <button
        key={sectionId}
        type="button"
        onClick={() => navigate(route.nestedPath)}
        onMouseEnter={() => preloadDashboardRoute(sectionId)}
        onFocus={() => preloadDashboardRoute(sectionId)}
        aria-current={active ? "page" : undefined}
        className={cn(navItemClasses(active, collapsed), indented && !sidebarCollapsed && "ms-2 ps-8 pe-3 py-1.5 text-[12px]")}
      >
        <Icon
          className={cn(
            "shrink-0 transition-transform duration-150 group-hover:scale-105",
            collapsed ? "size-[18px]" : "size-4",
            active ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/80",
          )}
          aria-hidden="true"
        />
        {!sidebarCollapsed && (
          <>
            <span className="flex-1 truncate text-start">{label}</span>
            {badge !== undefined && badge > 0 && (
              <span
                className={cn(
                  "min-w-[20px] rounded-md px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums",
                  active
                    ? "bg-sidebar-primary-foreground/20 text-sidebar-primary-foreground"
                    : "bg-sidebar-accent text-sidebar-foreground/70",
                )}
              >
                {badge}
              </span>
            )}
          </>
        )}
      </button>
    );

    if (collapsed) {
      return (
        <Tooltip key={sectionId}>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side={isRtl ? "left" : "right"} sideOffset={8}>
            {label}
            {badge !== undefined && badge > 0 && ` (${badge})`}
          </TooltipContent>
        </Tooltip>
      );
    }

    return button;
  };

  const renderGroup = (groupId: DashboardSidebarGroupId): ReactNode => {
    const group = DASHBOARD_SIDEBAR_GROUPS.find((g) => g.id === groupId);
    if (!group) return null;

    const visibleChildren = group.childIds.filter((childId) =>
      isDashboardRoutePermitted(getDashboardRouteById(childId), isSuperAdmin, hasPermission, platformFeatureEnabled),
    );
    if (visibleChildren.length === 0) return null;

    const groupActive = visibleChildren.some((id) => id === activeSectionId);
    const GroupIcon = group.icon;
    const groupLabel = t(group.titleKey);
    const isOpen = groupOpen[groupId];

    if (sidebarCollapsed) {
      return (
        <div key={group.id} className="space-y-0.5">
          {visibleChildren.map((childId) => renderNavItem(childId))}
        </div>
      );
    }

    return (
      <Collapsible
        key={group.id}
        open={isOpen}
        onOpenChange={(open) => setGroupOpen((prev) => ({ ...prev, [groupId]: open }))}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150",
              groupActive
                ? "text-sidebar-primary"
                : "text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground",
            )}
          >
            <GroupIcon className="size-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 text-start">{groupLabel}</span>
            <ChevronDown
              className={cn("size-3.5 shrink-0 opacity-60 transition-transform duration-150", isOpen && "rotate-180")}
              aria-hidden="true"
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-0.5 pt-0.5">
          {visibleChildren.map((childId) => renderNavItem(childId, true))}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const renderSectionLabel = (key: SidebarSectionKey) => {
    if (sidebarCollapsed) return null;
    return (
      <p key={key} className="shell-section-label first:pt-2">
        {t(`appShell.sidebar.sections.${key}`)}
      </p>
    );
  };

  const homeButton = (
    <button
      type="button"
      onClick={() => navigate("/")}
      aria-current={isHomeActive ? "page" : undefined}
      className={navItemClasses(isHomeActive, sidebarCollapsed)}
    >
      <LayoutDashboard
        className={cn(
          "shrink-0",
          sidebarCollapsed ? "size-[18px]" : "size-4",
          isHomeActive ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/80",
        )}
        aria-hidden="true"
      />
      {!sidebarCollapsed && <span className="flex-1 text-start">{t("navigation.home")}</span>}
    </button>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <>
        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-background/90 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        <aside
          className={cn(
            "shell-sidebar-gradient fixed inset-y-0 z-50 flex shrink-0 flex-col border-sidebar-border text-sidebar-foreground transition-[width,transform] duration-200 ease-out lg:static lg:z-auto",
            isRtl ? "border-s end-0" : "border-e start-0",
            sidebarCollapsed ? "w-[4.5rem]" : "w-[17rem]",
            mobileSidebarOpen
              ? "translate-x-0"
              : isRtl
                ? "translate-x-full lg:translate-x-0"
                : "-translate-x-full lg:translate-x-0",
            className,
          )}
          aria-label={t("appShell.sidebar.label")}
        >
          <div
            className={cn(
              "flex h-16 shrink-0 items-center border-b border-sidebar-border",
              sidebarCollapsed ? "justify-center px-2" : "gap-3 px-4",
            )}
          >
            <button
              type="button"
              onClick={() => navigate("/")}
              className="flex min-w-0 items-center gap-3 text-start transition-opacity hover:opacity-90"
              aria-label={t("navigation.home")}
            >
              <CompanyLogo
                name={displayName}
                logoUrl={sidebarCollapsed ? compactLogo : chromeLogo}
                className="size-9 shrink-0 rounded-xl shadow-lg shadow-primary/20"
              />
              {!sidebarCollapsed && (
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold tracking-tight leading-none">
                    {identity?.name ? (
                      identity.name
                    ) : (
                      <>
                        Value<span className="text-primary">OR</span>
                      </>
                    )}
                  </p>
                  <p className="mt-1 truncate text-[10px] font-medium uppercase tracking-[0.12em] text-sidebar-foreground/50">
                    {t("app.dashboard")}
                  </p>
                </div>
              )}
            </button>
          </div>

          <nav
            className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3"
            aria-label={t("appShell.sidebar.navigation")}
          >
            {!sidebarCollapsed && (
              <p className="shell-section-label pt-0">{t("appShell.sidebar.sections.platform")}</p>
            )}

            {sidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>{homeButton}</TooltipTrigger>
                <TooltipContent side={isRtl ? "left" : "right"} sideOffset={8}>
                  {t("navigation.home")}
                </TooltipContent>
              </Tooltip>
            ) : (
              homeButton
            )}

            {DASHBOARD_SIDEBAR_ORDER.map((entry) => {
              const sectionKey = sectionLabelForEntry(entry);
              return (
                <div key={entry.type === "group" ? entry.id : entry.id}>
                  {sectionKey && renderSectionLabel(sectionKey)}
                  {entry.type === "group" ? renderGroup(entry.id) : renderNavItem(entry.id)}
                </div>
              );
            })}
          </nav>

          <div className="shrink-0 space-y-1 border-t border-sidebar-border p-2">
            {sidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => navigate("/settings/profile")}
                    className="mx-auto flex size-9 items-center justify-center rounded-lg transition-colors hover:bg-sidebar-accent"
                    aria-label={t("dashboard.settings.nav.personalProfile")}
                  >
                    <UserAvatar className="size-8 border border-sidebar-border" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side={isRtl ? "left" : "right"} sideOffset={8}>
                  {userName}
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                type="button"
                onClick={() => navigate("/settings/profile")}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-start transition-colors hover:bg-sidebar-accent"
              >
                <UserAvatar className="size-8 shrink-0 border border-sidebar-border" />
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-sidebar-foreground/80">
                  {userName}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-sidebar-foreground/50 transition-all duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                sidebarCollapsed && "mx-auto size-9 p-0",
              )}
              aria-label={
                sidebarCollapsed ? t("appShell.sidebar.expand") : t("appShell.sidebar.collapse")
              }
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="size-4" aria-hidden="true" />
              ) : (
                <>
                  <PanelLeftClose className="size-4" aria-hidden="true" />
                  <span>{t("appShell.sidebar.collapse")}</span>
                </>
              )}
            </button>
          </div>
        </aside>
      </>
    </TooltipProvider>
  );
});
