import { Suspense } from "react";
import { Route, Switch } from "wouter";
import { WORKSPACE_ROUTE_REGISTRY } from "@/config/workspace-route-registry";
import { WorkspaceRouteGuard } from "@/components/workspace/layout/workspace-route-guard";
import { WorkspaceSubNav } from "@/components/workspace/layout/workspace-sub-nav";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";

function GuardedRoute({ route }: { route: (typeof WORKSPACE_ROUTE_REGISTRY)[number] }) {
  const Page = route.Page;
  return <WorkspaceRouteGuard route={route} Page={Page} />;
}

export function WorkspaceLayout() {
  return (
    <div>
      <WorkspaceSubNav />
      <Suspense fallback={<DashboardPageFallback />}>
        <Switch>
          {WORKSPACE_ROUTE_REGISTRY.map((route) => (
            <Route key={route.id} path={route.nestedPath}>
              <GuardedRoute route={route} />
            </Route>
          ))}
        </Switch>
      </Suspense>
    </div>
  );
}
