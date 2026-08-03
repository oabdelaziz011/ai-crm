import { Suspense } from "react";
import { Redirect, Route, Switch } from "wouter";
import {
  UNIVERSAL_OPERATIONS_DEFAULT_NESTED_PATH,
  UNIVERSAL_OPERATIONS_ROUTE_REGISTRY,
} from "@/config/universal-operations-route-registry";
import { UniversalOperationsSubNav } from "@/components/universal-operations/layout/universal-operations-sub-nav";
import { UniversalOperationsRouteGuard } from "@/components/universal-operations/layout/universal-operations-route-guard";
import { WorkspacePlatformShell } from "@/components/universal-workspace/workspace-platform-shell";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { NEST_INDEX } from "@/lib/routing";

function GuardedRoute({ route }: { route: (typeof UNIVERSAL_OPERATIONS_ROUTE_REGISTRY)[number] }) {
  const Page = route.Page;
  return <UniversalOperationsRouteGuard route={route} Page={Page} />;
}

export function UniversalOperationsLayout() {
  return (
    <WorkspacePlatformShell>
      <div className="space-y-4">
        <UniversalOperationsSubNav />
        <Suspense fallback={<DashboardPageFallback />}>
          <Switch>
            <Route path={NEST_INDEX}>
              <Redirect to={UNIVERSAL_OPERATIONS_DEFAULT_NESTED_PATH} />
            </Route>
            {UNIVERSAL_OPERATIONS_ROUTE_REGISTRY.map((route) => (
              <Route key={route.id} path={route.nestedPath}>
                <GuardedRoute route={route} />
              </Route>
            ))}
          </Switch>
        </Suspense>
      </div>
    </WorkspacePlatformShell>
  );
}
