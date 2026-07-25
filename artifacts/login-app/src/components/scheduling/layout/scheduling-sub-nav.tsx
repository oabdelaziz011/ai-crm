import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { schedulingNavItems, isSchedulingDetailNestPath } from "@/config/scheduling-route-registry";
import { useAuthUser } from "@/hooks/use-rbac";
import { isSchedulingRoutePermitted } from "@/lib/scheduling/scheduling-permissions";
import { isNestedSectionActive, nestedSectionHref } from "@/lib/routing";
import { translateRouteTitle } from "@/lib/i18n/translate-route-title";
import { cn } from "@/lib/utils";

export function SchedulingSubNav() {
  const [location] = useLocation();
  const { t, i18n } = useTranslation("common");
  const { hasPermission, isSuperAdmin } = useAuthUser();

  const items = schedulingNavItems().filter((item) =>
    isSchedulingRoutePermitted(item.permission, hasPermission, isSuperAdmin),
  );

  return (
    <nav key={i18n.language} className="mb-6 flex flex-wrap gap-2 border-b border-white/5 pb-4">
      {items.map((item) => {
        const href = nestedSectionHref(item.nestedPath);
        const active =
          !isSchedulingDetailNestPath(location) &&
          isNestedSectionActive(location, item.nestedPath);
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
