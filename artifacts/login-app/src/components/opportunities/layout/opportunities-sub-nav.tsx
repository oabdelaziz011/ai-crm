import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { opportunitiesNavItems } from "@/config/opportunities-route-registry";
import { useAuthUser } from "@/hooks/use-rbac";
import { isNestedSectionActive, nestedSectionHref } from "@/lib/routing";
import { translateRouteTitle } from "@/lib/i18n/translate-route-title";
import { cn } from "@/lib/utils";

export function OpportunitiesSubNav() {
  const [location] = useLocation();
  const { t } = useTranslation("common");
  const { hasPermission, isSuperAdmin } = useAuthUser();

  const items = opportunitiesNavItems().filter((item) => {
    if (!item.permission) return true;
    return isSuperAdmin || hasPermission(item.permission);
  });

  return (
    <div className="flex items-center gap-6 border-b border-border/50 pb-0">
      {items.map((item) => {
        const href = nestedSectionHref(item.nestedPath);
        const active = isNestedSectionActive(location, item.nestedPath);
        return (
          <Link
            key={item.id}
            href={href}
            className={cn(
              "relative -mb-px pb-2.5 text-[13px] font-medium tracking-tight transition-colors",
              active
                ? "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {translateRouteTitle(t, item.titleKey)}
          </Link>
        );
      })}
    </div>
  );
}
