import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import type { CompanyRouteDefinition } from "@/config/company-route-registry";
import { useAuthUser } from "@/hooks/use-rbac";

function isCompanyRoutePermitted(
  permission: string | undefined,
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  if (isSuperAdmin) return true;
  if (!permission) return true;
  return hasPermission(permission);
}

export function CompanyRouteGuard({
  route,
  Page,
}: {
  route: CompanyRouteDefinition;
  Page: ComponentType;
}) {
  const { t } = useTranslation("common");
  const { hasPermission, isSuperAdmin } = useAuthUser();

  if (!isCompanyRoutePermitted(route.permission, hasPermission, isSuperAdmin)) {
    return (
      <p className="text-sm text-muted-foreground">{t("branches.noPermission")}</p>
    );
  }

  return <Page />;
}

export function useCompanyEditAccess() {
  const { hasPermission, isSuperAdmin } = useAuthUser();
  return isSuperAdmin || hasPermission("settings.edit") || hasPermission("scheduling.edit");
}
