import AccessDeniedPage from "@/pages/access-denied";
import { DashboardErrorBanner } from "@/components/dashboard/ui";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { useAuthUser } from "@/hooks/use-rbac";
import { useCommercialFeatureLookup } from "@/hooks/billing/use-commercial-feature-lookup";
import { isSettingsRoutePermitted } from "@/lib/settings/settings-permissions";
import type { SettingsRouteDefinition } from "@/config/settings-route-registry";

type Props = {
  route: SettingsRouteDefinition;
  Page: SettingsRouteDefinition["Page"];
};

export function SettingsRouteGuard({ route, Page }: Props) {
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const { lookup: commercialFeatureEnabled, isLoading: commercialLoading } =
    useCommercialFeatureLookup();

  if (route.commercialFeatureCode && commercialLoading && !isSuperAdmin) {
    return <DashboardPageFallback />;
  }

  if (
    !isSettingsRoutePermitted(route, hasPermission, isSuperAdmin, commercialFeatureEnabled)
  ) {
    return (
      <AccessDeniedPage
        requiredPermission={
          route.superAdminOnly
            ? "super_admin"
            : (route.permission ?? route.commercialFeatureCode ?? "settings.view")
        }
      />
    );
  }

  if (!Page) {
    return <DashboardErrorBanner message="Unable to load this settings page." />;
  }

  return <Page />;
}
