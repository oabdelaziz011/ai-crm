import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { universalOperationsNavItems } from "@/config/universal-operations-route-registry";
import { useAuthUser } from "@/hooks/use-rbac";
import { isNestedSectionActive, nestedSectionHref } from "@/lib/routing";
import { translateRouteTitle } from "@/lib/i18n/translate-route-title";
import { cn } from "@/lib/utils";

export function UniversalOperationsSubNav() {
  const [location] = useLocation();
  const { t, i18n } = useTranslation("common");
  const { hasPermission, isSuperAdmin } = useAuthUser();

  const items = universalOperationsNavItems().filter((item) => {
    if (!item.permission) return true;
    return isSuperAdmin || hasPermission(item.permission);
  });

  return (
    <nav key={i18n.language} className="mb-0 flex flex-wrap gap-1.5 border-b border-border/60 pb-2">
      {items.map((item) => {
        const href = nestedSectionHref(item.nestedPath);
        const active = isNestedSectionActive(location, item.nestedPath);
        return (
          <Link
            key={`${item.id}-${i18n.language}`}
            href={href}
            className={cn(
              "rounded-md px-2.5 py-1 text-sm transition-colors",
              active
                ? "bg-primary/15 text-primary border border-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
            )}
          >
            {translateRouteTitle(t, item.titleKey)}
          </Link>
        );
      })}
    </nav>
  );
}
