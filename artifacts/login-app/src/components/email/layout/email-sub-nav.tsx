import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { emailNavItems } from "@/config/email-route-registry";
import { useCommercialFeatureLookup } from "@/hooks/billing/use-commercial-feature-lookup";
import { isNestedSectionActive, nestedSectionHref } from "@/lib/routing";

export function EmailSubNav() {
  const { t } = useTranslation("common");
  const [location] = useLocation();
  const { lookup: commercialFeatureEnabled } = useCommercialFeatureLookup();

  return (
    <nav className="flex flex-wrap gap-2 border-b pb-3">
      {emailNavItems(commercialFeatureEnabled).map((route) => {
        const href = nestedSectionHref(route.nestedPath);
        const active = isNestedSectionActive(location, route.nestedPath);
        return (
          <Link
            key={route.id}
            href={href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {t(route.titleKey)}
          </Link>
        );
      })}
    </nav>
  );
}
