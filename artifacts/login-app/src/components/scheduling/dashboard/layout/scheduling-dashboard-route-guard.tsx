import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import type { SchedulingDashboardRouteDefinition } from "@/config/scheduling-dashboard-route-registry";
import { useAuthUser } from "@/hooks/use-rbac";

function isRouteAllowed(
  route: SchedulingDashboardRouteDefinition,
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  if (!route.permission) return true;
  return isSuperAdmin || hasPermission(route.permission);
}

export function SchedulingDashboardRouteGuard({
  route,
  Page,
}: {
  route: SchedulingDashboardRouteDefinition;
  Page: ComponentType;
}) {
  const { t } = useTranslation("common");
  const { hasPermission, isSuperAdmin } = useAuthUser();

  if (!isRouteAllowed(route, hasPermission, isSuperAdmin)) {
    return <p className="text-sm text-muted-foreground">{t("scheduling.operations.noPermission")}</p>;
  }

  return <Page />;
}
