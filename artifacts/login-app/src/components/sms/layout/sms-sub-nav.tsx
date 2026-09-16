import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { smsNavItems } from "@/config/sms-route-registry";
import { useHasPermission } from "@/hooks/use-rbac";
import { isNestedSectionActive } from "@/lib/routing";
import { cn } from "@/lib/utils";

export const SMS_SETTINGS_HREF = "~/dashboard/settings/sms";

export function SmsSubNav() {
  const { t } = useTranslation("common");
  const [location] = useLocation();
  const pathOnly = location.split("?")[0] || "/";
  const canConfigure = useHasPermission("settings.edit");
  const items = smsNavItems();

  return (
    <nav className="mt-1 flex flex-wrap items-center gap-2" data-testid="sms-sub-nav">
      {items.map((route) => {
        const href = route.nestedPath === "/" ? "~/dashboard/sms" : `~/dashboard/sms${route.nestedPath}`;
        const active = isNestedSectionActive(pathOnly, route.nestedPath);
        return (
          <Link
            key={route.id}
            href={href}
            className={cn(
              "rounded-md px-2.5 py-1 text-sm transition-colors",
              active
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {t(route.titleKey)}
          </Link>
        );
      })}
      {canConfigure ? (
        <Link
          href={SMS_SETTINGS_HREF}
          className="ms-auto rounded-md px-2.5 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          data-testid="sms-configure-settings-link"
        >
          {t("smsModule.nav.settings")}
        </Link>
      ) : null}
    </nav>
  );
}
