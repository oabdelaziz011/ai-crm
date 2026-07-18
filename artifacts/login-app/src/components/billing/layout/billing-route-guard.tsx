import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import type { BillingRouteDefinition } from "@/config/billing-route-registry";
import { useAuthUser } from "@/hooks/use-rbac";
import {
  canViewBilling,
  canViewBillingAudit,
  canViewBillingSettings,
} from "@/lib/billing/billing-permissions";

function isRouteAllowed(
  route: BillingRouteDefinition,
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  if (route.id === "settings") {
    return canViewBillingSettings(hasPermission, isSuperAdmin);
  }
  if (route.id === "audit") {
    return canViewBillingAudit(hasPermission, isSuperAdmin);
  }
  return canViewBilling(hasPermission, isSuperAdmin);
}

export function BillingRouteGuard({
  route,
  Page,
}: {
  route: BillingRouteDefinition;
  Page: ComponentType;
}) {
  const { t } = useTranslation("common");
  const { hasPermission, isSuperAdmin } = useAuthUser();

  if (!isRouteAllowed(route, hasPermission, isSuperAdmin)) {
    return <p className="text-sm text-muted-foreground">{t("billing.noPermission")}</p>;
  }

  return <Page />;
}
