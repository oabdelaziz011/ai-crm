import { Suspense } from "react";
import AccessDeniedPage from "@/pages/access-denied";
import {
  type DashboardRouteDefinition,
  isDashboardRoutePermitted,
} from "@/config/dashboard-route-registry";
import { useAuthUser } from "@/hooks/use-rbac";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";

type DashboardSectionRouteProps = {
  route: DashboardRouteDefinition;
};

export function DashboardSectionRoute({ route }: DashboardSectionRouteProps) {
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const permitted = isDashboardRoutePermitted(route, isSuperAdmin, hasPermission);

  if (!permitted) {
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
