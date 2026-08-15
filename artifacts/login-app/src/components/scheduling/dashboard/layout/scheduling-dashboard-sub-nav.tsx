import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { schedulingDashboardNavItems } from "@/config/scheduling-dashboard-route-registry";
import { ModulePageHeader } from "@/components/dashboard/module-page-header";
import { useAuthUser } from "@/hooks/use-rbac";
import { isNestedSectionActive, nestedSectionHref } from "@/lib/routing";
import { translateRouteTitle } from "@/lib/i18n/translate-route-title";
import { cn } from "@/lib/utils";

const SETUP_IDS = new Set(["availability", "resources", "booking-rules", "holidays"]);

export function SchedulingDashboardSubNav() {
  const [location] = useLocation();
  const { t, i18n } = useTranslation("common");
  const { hasPermission, isSuperAdmin } = useAuthUser();

  const items = schedulingDashboardNavItems().filter((item) => {
    if (!item.permission) return true;
    return isSuperAdmin || hasPermission(item.permission);
  });

  const { dayItems, setupItems } = useMemo(() => {
    const day: typeof items = [];
    const setup: typeof items = [];
    for (const item of items) {
      if (SETUP_IDS.has(item.id)) setup.push(item);
      else day.push(item);
    }
    return { dayItems: day, setupItems: setup };
  }, [items]);

  const renderLink = (item: (typeof items)[number]) => {
    const href = item.externalPath ?? nestedSectionHref(item.nestedPath);
    const active = item.externalPath
      ? location === item.externalPath || location.startsWith(`${item.externalPath}/`)
      : isNestedSectionActive(location, item.nestedPath);

    return (
      <Link
        key={`${item.id}-${i18n.language}`}
        href={href}
        className={cn(
          "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
          active
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-border/60 bg-background text-muted-foreground hover:border-border hover:text-foreground",
        )}
      >
        {translateRouteTitle(t, item.titleKey)}
      </Link>
    );
  };

  return (
    <div key={i18n.language} className="space-y-4">
      <ModulePageHeader
        title={t("scheduling.title")}
        subtitle={t("scheduling.subtitle")}
      />

      <nav className="flex flex-col gap-3" aria-label={t("scheduling.title")}>
        {dayItems.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("scheduling.dashboard.groups.day")}
            </p>
            <div className="flex flex-wrap gap-2">{dayItems.map(renderLink)}</div>
          </div>
        ) : null}

        {setupItems.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("scheduling.dashboard.groups.setup")}
            </p>
            <div className="flex flex-wrap gap-2">{setupItems.map(renderLink)}</div>
          </div>
        ) : null}
      </nav>
    </div>
  );
}
