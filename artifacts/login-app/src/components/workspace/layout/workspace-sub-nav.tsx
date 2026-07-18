import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { workspaceNavItems } from "@/config/workspace-route-registry";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import { isNestedSectionActive, nestedSectionHref } from "@/lib/routing";
import { translateRouteTitle } from "@/lib/i18n/translate-route-title";
import { canAccessWorkspace } from "@/lib/workspace/workspace-permissions";
import { cn } from "@/lib/utils";

export function WorkspaceSubNav() {
  const [location] = useLocation();
  const { t, i18n } = useTranslation("common");
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const { company } = useAuth();
  const hasCompany = Boolean(company?.id);

  const items = workspaceNavItems().filter((item) => {
    if (!canAccessWorkspace(hasPermission, isSuperAdmin, hasCompany)) return false;
    if (item.permission) {
      return isSuperAdmin || hasPermission(item.permission) || hasPermission("workspace.view");
    }
    return true;
  });

  return (
    <nav key={i18n.language} className="mb-6 flex flex-wrap gap-2 border-b border-white/5 pb-4">
      {items.map((item) => {
        const href = nestedSectionHref(item.nestedPath);
        const active = isNestedSectionActive(location, item.nestedPath);
        return (
          <Link
            key={`${item.id}-${i18n.language}`}
            href={href}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm transition-colors",
              active
                ? "border border-primary/20 bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
            )}
          >
            {translateRouteTitle(t, item.titleKey)}
          </Link>
        );
      })}
    </nav>
  );
}
