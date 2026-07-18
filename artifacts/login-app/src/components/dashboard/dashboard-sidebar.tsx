import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { ChevronDown, LayoutDashboard, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import { useCustomers } from "@/hooks/use-customers";
import { useBookings } from "@/hooks/use-bookings";
import { useInvoices } from "@/hooks/use-invoices";
import type { Booking, Invoice } from "@/lib/types";
import { useTranslation } from "react-i18next";
import {
  DASHBOARD_SIDEBAR_GROUPS,
  DASHBOARD_SIDEBAR_ORDER,
  getDashboardRouteById,
  isDashboardRoutePermitted,
  sectionIdFromNestedPath,
  USER_MANAGEMENT_SECTION_IDS,
  type DashboardSectionId,
  type DashboardSidebarGroupId,
} from "@/config/dashboard-route-registry";
import { isDashboardHomeNestedPath } from "@/lib/dashboard-home";

type DashboardSidebarProps = {
  sidebarOpen: boolean;
  onNavigate: () => void;
  onSignOut: () => void;
};

export function DashboardSidebar({ sidebarOpen, onNavigate, onSignOut }: DashboardSidebarProps) {
  const { t, i18n } = useTranslation("common");
  const [location, setLocation] = useLocation();
  const { user, displayName } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const isRtl = i18n.dir() === "rtl";

  const activeSectionId = sectionIdFromNestedPath(location);
  const isHomeActive = isDashboardHomeNestedPath(location);
  const isUserManagementActive =
    activeSectionId !== null && USER_MANAGEMENT_SECTION_IDS.includes(activeSectionId);
  const [userManagementOpen, setUserManagementOpen] = useState(isUserManagementActive);

  useEffect(() => {
    if (isUserManagementActive) {
      setUserManagementOpen(true);
    }
  }, [isUserManagementActive]);

  const { data: customers = [] } = useCustomers();
  const { data: bookings = [] } = useBookings();
  const { data: invoices = [] } = useInvoices();

  const badgeCounts: Partial<Record<DashboardSectionId, number>> = {
    customers: customers.length,
    bookings: bookings.filter((booking: Booking) => booking.status === "Pending").length,
    invoices: invoices.filter(
      (invoice: Invoice) => invoice.status === "Unpaid" || invoice.status === "Overdue",
    ).length,
  };

  const navigateToHome = () => {
    setLocation("/");
    onNavigate();
  };

  const navigateToSection = (sectionId: DashboardSectionId) => {
    const route = getDashboardRouteById(sectionId);
    setLocation(route.nestedPath);
    onNavigate();
  };

  const renderNavButton = (sectionId: DashboardSectionId, indented = false) => {
    const route = getDashboardRouteById(sectionId);
    if (!isDashboardRoutePermitted(route, isSuperAdmin, hasPermission)) {
      return null;
    }

    const active = activeSectionId === sectionId;
    const badge = badgeCounts[sectionId];
    const Icon = route.icon;

    return (
      <button
        key={sectionId}
        type="button"
        onClick={() => navigateToSection(sectionId)}
        className={`
          w-full flex items-center gap-3 rounded-xl text-sm font-medium
          transition-all duration-200 group relative
          ${indented ? "ps-9 pe-3 py-2" : "px-3 py-2.5"}
          ${active
            ? "bg-primary/15 text-primary border border-primary/20"
            : "text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent"}
        `}
      >
        <Icon
          className={`w-4 h-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`}
        />
        <span className="flex-1 text-start">{t(route.titleKey)}</span>
        {badge !== undefined && badge > 0 && (
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${
              active ? "bg-primary/30 text-primary" : "bg-white/10 text-muted-foreground"
            }`}
          >
            {badge}
          </span>
        )}
      </button>
    );
  };

  const renderGroup = (groupId: DashboardSidebarGroupId): ReactNode => {
    const group = DASHBOARD_SIDEBAR_GROUPS.find((entry) => entry.id === groupId);
    if (!group) {
      return null;
    }

    const visibleChildren = group.childIds.filter((childId) => {
      const route = getDashboardRouteById(childId);
      return isDashboardRoutePermitted(route, isSuperAdmin, hasPermission);
    });

    if (visibleChildren.length === 0) {
      return null;
    }

    const groupActive = visibleChildren.some((childId) => childId === activeSectionId);
    const GroupIcon = group.icon;

    return (
      <Collapsible key={group.id} open={userManagementOpen} onOpenChange={setUserManagementOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
              transition-all duration-200 group relative
              ${groupActive
                ? "bg-primary/15 text-primary border border-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent"}
            `}
          >
            <GroupIcon
              className={`w-4 h-4 shrink-0 ${groupActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`}
            />
            <span className="flex-1 text-start">{t(group.titleKey)}</span>
            <ChevronDown
              className={`w-4 h-4 shrink-0 transition-transform duration-200 ${userManagementOpen ? "rotate-180" : ""}`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-1 pt-1">
          {visibleChildren.map((childId) => renderNavButton(childId, true))}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <aside
      className={`
        fixed lg:static inset-y-0 z-30 lg:z-auto
        w-64 flex-shrink-0 flex flex-col
        bg-black/60 border-white/5 backdrop-blur-xl
        transition-transform duration-300 lg:translate-x-0
        start-0 border-e
        ${sidebarOpen ? "translate-x-0" : isRtl ? "translate-x-full" : "-translate-x-full"}
      `}
    >
      <div className="p-6 border-b border-white/5 flex items-center gap-3">
        <button
          type="button"
          onClick={navigateToHome}
          className="flex items-center gap-3 min-w-0 text-start hover:opacity-90 transition-opacity"
        >
          <div className="w-9 h-9 bg-primary/10 border border-primary/30 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(0,212,255,0.2)] shrink-0">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-bold tracking-wide leading-none">
              Vault<span className="text-primary/80">OS</span>
            </h2>
            <p className="text-[10px] text-muted-foreground font-mono mt-0.5 tracking-widest uppercase">
              {t("app.dashboard")}
            </p>
          </div>
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <button
          type="button"
          onClick={navigateToHome}
          className={`
            w-full flex items-center gap-3 rounded-xl text-sm font-medium
            transition-all duration-200 group relative px-3 py-2.5
            ${isHomeActive
              ? "bg-primary/15 text-primary border border-primary/20"
              : "text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent"}
          `}
        >
          <LayoutDashboard
            className={`w-4 h-4 shrink-0 ${isHomeActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`}
          />
          <span className="flex-1 text-start">{t("navigation.home")}</span>
        </button>
        {DASHBOARD_SIDEBAR_ORDER.map((entry) => {
          if (entry.type === "group") {
            return renderGroup(entry.id);
          }
          return renderNavButton(entry.id);
        })}
      </nav>

      <div className="p-4 border-t border-white/5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{displayName}</p>
            <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full border-white/10 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/30 transition-all text-xs gap-2"
          onClick={onSignOut}
        >
          <LogOut className="w-3.5 h-3.5" /> {t("buttons.signOut")}
        </Button>
      </div>
    </aside>
  );
}
