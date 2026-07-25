import { Suspense } from "react";
import { Redirect, Route, Switch } from "wouter";
import { useTranslation } from "react-i18next";
import {
  SCHEDULING_DEFAULT_NESTED_PATH,
  SCHEDULING_ROUTE_REGISTRY,
} from "@/config/scheduling-route-registry";
import { SchedulingRouteGuard } from "@/components/scheduling/layout/scheduling-route-guard";
import { SchedulingSubNav } from "@/components/scheduling/layout/scheduling-sub-nav";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { NEST_INDEX } from "@/lib/routing";
import { SchedulingResourceProfilePage } from "@/pages/dashboard/settings/scheduling/scheduling-resource-profile-page";
import { SchedulingServiceProfilePage } from "@/pages/dashboard/settings/scheduling/scheduling-service-profile-page";

function GuardedRoute({ route }: { route: (typeof SCHEDULING_ROUTE_REGISTRY)[number] }) {
  const Page = route.Page;
  return <SchedulingRouteGuard route={route} Page={Page} />;
}

export function SchedulingLayout() {
  const { t } = useTranslation("common");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("scheduling.title")}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t("scheduling.subtitle")}</p>
      </div>

      <SchedulingSubNav />

      <Suspense fallback={<DashboardPageFallback />}>
        <Switch>
          <Route path={NEST_INDEX}>
            <Redirect to={SCHEDULING_DEFAULT_NESTED_PATH} />
          </Route>
          <Route path="/resources/:resourceId">
            <SchedulingRouteGuard
              route={SCHEDULING_ROUTE_REGISTRY[0]}
              Page={SchedulingResourceProfilePage}
            />
          </Route>
          <Route path="/services/:serviceId">
            <SchedulingRouteGuard
              route={SCHEDULING_ROUTE_REGISTRY[1]}
              Page={SchedulingServiceProfilePage}
            />
          </Route>
          {SCHEDULING_ROUTE_REGISTRY.map((route) => (
            <Route key={route.id} path={route.nestedPath}>
              <GuardedRoute route={route} />
            </Route>
          ))}
        </Switch>
      </Suspense>
    </div>
  );
}
