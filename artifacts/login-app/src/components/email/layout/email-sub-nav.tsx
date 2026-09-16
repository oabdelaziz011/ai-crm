import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { emailNavItems } from "@/config/email-route-registry";
import { useCommercialFeatureLookup } from "@/hooks/billing/use-commercial-feature-lookup";
import { useAuthUser } from "@/hooks/use-rbac";
import { canAccessEmailSettingsPage } from "@/lib/email-workspace/email-tab-permissions";
import { isNestedSectionActive, nestedSectionHref } from "@/lib/routing";

const EMAIL_SETTINGS_HREF = "~/dashboard/settings/email";

export function EmailSubNav() {
  const { t } = useTranslation("common");
  const [location] = useLocation();
  const { lookup: commercialFeatureEnabled } = useCommercialFeatureLookup();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const settingsActive = location.startsWith("/dashboard/settings/email") || location.startsWith("~/dashboard/settings/email");
  const showSettings =
    canAccessEmailSettingsPage(hasPermission, isSuperAdmin) &&
    (isSuperAdmin || commercialFeatureEnabled("email_channel") === true);

  return (
    <nav className="flex flex-wrap gap-1">
      {emailNavItems(commercialFeatureEnabled, { hasPermission, isSuperAdmin }).map((route) => {
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
      {showSettings ? (
        <Link
          href={EMAIL_SETTINGS_HREF}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            settingsActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
          )}
        >
          {t("emailModule.nav.settings")}
        </Link>
      ) : null}
    </nav>
  );
}
