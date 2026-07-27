import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { schedulingDashboardNavItems } from "@/config/scheduling-dashboard-route-registry";
import { useAuthUser } from "@/hooks/use-rbac";
import { isNestedSectionActive, nestedSectionHref } from "@/lib/routing";
import { translateRouteTitle } from "@/lib/i18n/translate-route-title";
import { cn } from "@/lib/utils";

export function SchedulingDashboardSubNav() {
  const [location] = useLocation();
  const { t, i18n } = useTranslation("common");
  const { hasPermission, isSuperAdmin } = useAuthUser();

  const items = schedulingDashboardNavItems().filter((item) => {
    if (!item.permission) return true;
    return isSuperAdmin || hasPermission(item.permission);
  });

  return (
    <nav key={i18n.language} className="mb-6 flex flex-wrap gap-2 border-b border-white/5 pb-4">
      {items.map((item) => {
        const href = item.externalPath ?? nestedSectionHref(item.nestedPath);
        const active = item.externalPath
          ? location === item.externalPath || location.startsWith(`${item.externalPath}/`)
          : isNestedSectionActive(location, item.nestedPath);

        return (
          <Link
            key={`${item.id}-${i18n.language}`}
            href={href}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-primary/15 text-primary border border-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5",
            )}
          >
            {translateRouteTitle(t, item.titleKey)}
          </Link>
        );
      })}
    </nav>
  );
}
