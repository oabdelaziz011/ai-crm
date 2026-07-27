import { Suspense } from "react";
import { Redirect, Route, Switch } from "wouter";
import {
  SCHEDULING_DASHBOARD_DEFAULT_NESTED_PATH,
  SCHEDULING_DASHBOARD_ROUTE_REGISTRY,
} from "@/config/scheduling-dashboard-route-registry";
import { SchedulingDashboardSubNav } from "@/components/scheduling/dashboard/layout/scheduling-dashboard-sub-nav";
import { SchedulingDashboardRouteGuard } from "@/components/scheduling/dashboard/layout/scheduling-dashboard-route-guard";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { NEST_INDEX } from "@/lib/routing";

function GuardedRoute({ route }: { route: (typeof SCHEDULING_DASHBOARD_ROUTE_REGISTRY)[number] }) {
  if (!route.Page) return null;
  const Page = route.Page;
  return <SchedulingDashboardRouteGuard route={route} Page={Page} />;
}

export function SchedulingDashboardLayout() {
  return (
    <div className="space-y-4">
      <SchedulingDashboardSubNav />
      <Suspense fallback={<DashboardPageFallback />}>
        <Switch>
          <Route path={NEST_INDEX}>
            <Redirect to={SCHEDULING_DASHBOARD_DEFAULT_NESTED_PATH} />
          </Route>
          {SCHEDULING_DASHBOARD_ROUTE_REGISTRY.filter((route) => route.Page).map((route) => (
            <Route key={route.id} path={route.nestedPath}>
              <GuardedRoute route={route} />
            </Route>
          ))}
        </Switch>
      </Suspense>
    </div>
  );
}
