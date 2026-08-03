import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { leadsNavItems } from "@/config/leads-route-registry";
import { useAuthUser } from "@/hooks/use-rbac";
import { isNestedSectionActive, nestedSectionHref } from "@/lib/routing";
import { cn } from "@/lib/utils";

export function LeadsSubNav() {
  const [location] = useLocation();
  const { t } = useTranslation("common");
  const { hasPermission, isSuperAdmin } = useAuthUser();

  const items = leadsNavItems().filter((item) => {
    if (!item.permission) return true;
    return isSuperAdmin || hasPermission(item.permission);
  });

  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-border/60 pb-4">
      {items.map((item) => {
        const href = nestedSectionHref(item.nestedPath);
        const active = isNestedSectionActive(location, item.nestedPath);
        return (
          <Link
            key={item.id}
            href={href}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-primary/15 text-primary border border-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
            )}
          >
            {t(item.titleKey, item.titleKey)}
          </Link>
        );
      })}
    </nav>
  );
}
