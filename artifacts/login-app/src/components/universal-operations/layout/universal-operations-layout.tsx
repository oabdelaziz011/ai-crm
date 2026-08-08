import { Suspense } from "react";
import { Redirect, Route, Switch, useLocation } from "wouter";
import {
  UNIVERSAL_OPERATIONS_DEFAULT_NESTED_PATH,
  UNIVERSAL_OPERATIONS_ROUTE_REGISTRY,
} from "@/config/universal-operations-route-registry";
import { UniversalOperationsSubNav } from "@/components/universal-operations/layout/universal-operations-sub-nav";
import { UniversalOperationsRouteGuard } from "@/components/universal-operations/layout/universal-operations-route-guard";
import { WorkspacePlatformShell } from "@/components/universal-workspace/workspace-platform-shell";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { isNestedSectionActive, NEST_INDEX } from "@/lib/routing";

function GuardedRoute({ route }: { route: (typeof UNIVERSAL_OPERATIONS_ROUTE_REGISTRY)[number] }) {
  const Page = route.Page;
  return <UniversalOperationsRouteGuard route={route} Page={Page} />;
}

export function UniversalOperationsLayout() {
  const [location] = useLocation();
  const isQueue = isNestedSectionActive(location, "/queue");
  const isEntityWorkspace = location.startsWith("/entity/");
  const hideChrome = isQueue || isEntityWorkspace;

  return (
    <WorkspacePlatformShell showToolbar={!hideChrome} showFavorites={!hideChrome}>
      <div className={hideChrome ? "flex min-h-0 flex-col" : "flex min-h-0 flex-col gap-2"}>
        {!hideChrome ? <UniversalOperationsSubNav /> : null}
        <div className="min-h-0 flex-1">
          <Suspense fallback={<DashboardPageFallback />}>
            <Switch>
              <Route path={NEST_INDEX}>
                <Redirect to={UNIVERSAL_OPERATIONS_DEFAULT_NESTED_PATH} />
              </Route>
              {/* Recover from nest-prefixed navigations that duplicated /operations */}
              <Route path="/operations/queue">
                <Redirect to="/queue" />
              </Route>
              <Route path="/operations/hub">
                <Redirect to="/hub" />
              </Route>
              <Route path="/operations/timeline">
                <Redirect to="/timeline" />
              </Route>
              <Route path="/operations/designer">
                <Redirect to="/designer" />
              </Route>
              {UNIVERSAL_OPERATIONS_ROUTE_REGISTRY.map((route) => (
                <Route key={route.id} path={route.nestedPath}>
                  <GuardedRoute route={route} />
                </Route>
              ))}
            </Switch>
          </Suspense>
        </div>
      </div>
    </WorkspacePlatformShell>
  );
}
