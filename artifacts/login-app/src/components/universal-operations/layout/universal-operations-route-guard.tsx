import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import type { UniversalOperationsRouteDefinition } from "@/config/universal-operations-route-registry";
import { useAuthUser } from "@/hooks/use-rbac";

function isRouteAllowed(
  route: UniversalOperationsRouteDefinition,
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  if (!route.permission) return true;
  return isSuperAdmin || hasPermission(route.permission);
}

export function UniversalOperationsRouteGuard({
  route,
  Page,
}: {
  route: UniversalOperationsRouteDefinition;
  Page: ComponentType;
}) {
  const { t } = useTranslation("common");
  const { hasPermission, isSuperAdmin } = useAuthUser();

  if (!isRouteAllowed(route, hasPermission, isSuperAdmin)) {
    return <p className="text-sm text-muted-foreground">{t("universalOperations.noPermission")}</p>;
  }

  return <Page />;
}
