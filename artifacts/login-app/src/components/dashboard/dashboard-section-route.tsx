import { Suspense, useEffect } from "react";
import {
  type DashboardRouteDefinition,
  isDashboardRoutePermitted,
} from "@/config/dashboard-route-registry";
import { useAuthUser } from "@/hooks/use-rbac";
import { usePlatformFeatureEnabledLookup } from "@/hooks/platform-ai/use-platform-ai-feature-enabled";
import { useCommercialFeatureLookup } from "@/hooks/billing/use-commercial-feature-lookup";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import AccessDeniedPage from "@/pages/access-denied";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";

type DashboardSectionRouteProps = {
  route: DashboardRouteDefinition;
};

export function DashboardSectionRoute({ route }: DashboardSectionRouteProps) {
  const { t } = useTranslation("common");
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const platformFeatureEnabled = usePlatformFeatureEnabledLookup();
  const { lookup: commercialFeatureEnabled, isLoading: commercialLoading } =
    useCommercialFeatureLookup();
  const permitted = isDashboardRoutePermitted(
    route,
    isSuperAdmin,
    hasPermission,
    platformFeatureEnabled,
    commercialFeatureEnabled,
  );

  useEffect(() => {
    if (!permitted && route.superAdminOnly && !isSuperAdmin) {
      void supabase.rpc("log_platform_access_denied", { p_event: "platform_route_denied" });
    }
  }, [permitted, route.superAdminOnly, isSuperAdmin]);

  if (route.commercialFeatureCode && commercialLoading && !isSuperAdmin) {
    return <DashboardPageFallback />;
  }
  if (route.requiresAnyChannelEntitlement && commercialLoading && !isSuperAdmin) {
    return <DashboardPageFallback />;
  }

  if (!permitted) {
    if (route.commercialFeatureCode || route.requiresAnyChannelEntitlement) {
      return (
        <AccessDeniedPage
          requiredPermission={route.permission ?? route.commercialFeatureCode ?? "channels"}
        />
      );
    }
    if (route.platformFeatureKey && route.id === "knowledge") {
      return (
        <div className="flex min-h-[40vh] items-center justify-center px-6">
          <p className="text-sm text-muted-foreground">{t("knowledge.featureDisabled")}</p>
        </div>
      );
    }
    if (route.platformFeatureKey && route.id === "automation") {
      return (
        <div className="flex min-h-[40vh] items-center justify-center px-6">
          <p className="text-sm text-muted-foreground">{t("automation.featureDisabled")}</p>
        </div>
      );
    }
    if (route.platformFeatureKey && route.id === "ai-analytics") {
      return (
        <div className="flex min-h-[40vh] items-center justify-center px-6">
          <p className="text-sm text-muted-foreground">{t("aiAnalytics.featureDisabled")}</p>
        </div>
      );
    }
    if (route.superAdminOnly) {
      return <AccessDeniedPage requiredPermission="super_admin" />;
    }
    return <AccessDeniedPage requiredPermission={route.permission ?? "access"} />;
  }

  const Page = route.Page;

  return (
    <Suspense fallback={<DashboardPageFallback />}>
      <Page />
    </Suspense>
  );
}
