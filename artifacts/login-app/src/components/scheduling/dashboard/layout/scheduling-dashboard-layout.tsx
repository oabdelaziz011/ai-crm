import { Suspense } from "react";
import { Redirect, Route, Switch } from "wouter";
import {
  SCHEDULING_DASHBOARD_ROUTE_REGISTRY,
} from "@/config/scheduling-dashboard-route-registry";
import { SchedulingDashboardRouteGuard } from "@/components/scheduling/dashboard/layout/scheduling-dashboard-route-guard";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { NEST_INDEX } from "@/lib/routing";

function GuardedRoute({ route }: { route: (typeof SCHEDULING_DASHBOARD_ROUTE_REGISTRY)[number] }) {
  if (!route.Page) return null;
  const Page = route.Page;
  return <SchedulingDashboardRouteGuard route={route} Page={Page} />;
}

/**
 * Legacy `/dashboard/scheduling` nest.
 * Setup lives under Settings → Scheduling; index redirects there.
 * `/operations` (Today’s board) remains for deep links from Calendar.
 */
export function SchedulingDashboardLayout() {
  return (
    <div className="space-y-5 bg-background">
      <Suspense fallback={<DashboardPageFallback />}>
        <Switch>
          <Route path={NEST_INDEX}>
            <Redirect to="~/dashboard/settings/scheduling" />
          </Route>
          {SCHEDULING_DASHBOARD_ROUTE_REGISTRY.filter((route) => route.Page).map((route) => (
            <Route key={route.id} path={route.nestedPath}>
              <GuardedRoute route={route} />
            </Route>
          ))}
          <Route>
            <Redirect to="~/dashboard/settings/scheduling" />
          </Route>
        </Switch>
      </Suspense>
    </div>
  );
}
