import AccessDeniedPage from "@/pages/access-denied";
import { DashboardErrorBanner } from "@/components/dashboard/ui";
import { useAuthUser } from "@/hooks/use-rbac";
import { isSettingsRoutePermitted } from "@/lib/settings/settings-permissions";
import type { SettingsRouteDefinition } from "@/config/settings-route-registry";

type Props = {
  route: SettingsRouteDefinition;
  Page: SettingsRouteDefinition["Page"];
};

export function SettingsRouteGuard({ route, Page }: Props) {
  const { hasPermission, isSuperAdmin } = useAuthUser();

  if (!isSettingsRoutePermitted(route, hasPermission, isSuperAdmin)) {
    return (
      <AccessDeniedPage
        requiredPermission={route.superAdminOnly ? "super_admin" : (route.permission ?? "settings.view")}
      />
    );
  }

  if (!Page) {
    return <DashboardErrorBanner message="Unable to load this settings page." />;
  }

  return <Page />;
}
