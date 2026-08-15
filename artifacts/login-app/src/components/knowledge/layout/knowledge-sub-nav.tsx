import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { knowledgeNavItems } from "@/config/knowledge-route-registry";
import { useAuthUser } from "@/hooks/use-rbac";
import {
  canImportKnowledge,
  canManageKnowledge,
  canViewKnowledge,
} from "@/lib/knowledge/knowledge-permissions";
import { isNestedSectionActive, nestedSectionHref } from "@/lib/routing";
import { translateRouteTitle } from "@/lib/i18n/translate-route-title";
import { cn } from "@/lib/utils";

export function KnowledgeSubNav() {
  const [location] = useLocation();
  const { t, i18n } = useTranslation("common");
  const { hasPermission, isSuperAdmin } = useAuthUser();

  const items = knowledgeNavItems().filter((item) => {
    if (!canViewKnowledge(hasPermission, isSuperAdmin)) return false;
    if (item.permission === "knowledge.import") {
      return canImportKnowledge(hasPermission, isSuperAdmin);
    }
    if (item.permission === "knowledge.manage") {
      return canManageKnowledge(hasPermission, isSuperAdmin);
    }
    return true;
  });

  return (
    <nav key={i18n.language} className="flex flex-wrap gap-2 border-b border-border/50 pb-3">
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
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            {translateRouteTitle(t, item.titleKey)}
          </Link>
        );
      })}
    </nav>
  );
}
