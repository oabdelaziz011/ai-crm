import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import type { SchedulingRouteDefinition } from "@/config/scheduling-route-registry";
import { useAuthUser } from "@/hooks/use-rbac";
import { canEditScheduling, isSchedulingRoutePermitted } from "@/lib/scheduling/scheduling-permissions";

export function SchedulingRouteGuard({
  route,
  Page,
}: {
  route: SchedulingRouteDefinition;
  Page: ComponentType;
}) {
  const { t } = useTranslation("common");
  const { hasPermission, isSuperAdmin } = useAuthUser();

  if (!isSchedulingRoutePermitted(route.permission, hasPermission, isSuperAdmin)) {
    return (
      <p className="text-sm text-muted-foreground">{t("scheduling.noPermission")}</p>
    );
  }

  return <Page />;
}

export function useSchedulingEditAccess() {
  const { hasPermission, isSuperAdmin } = useAuthUser();
  return canEditScheduling(hasPermission, isSuperAdmin);
}
