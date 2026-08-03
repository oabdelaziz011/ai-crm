import { Suspense } from "react";
import { Redirect, Route, Switch } from "wouter";
import { LEADS_DEFAULT_NESTED_PATH, LEADS_ROUTE_REGISTRY } from "@/config/leads-route-registry";
import { LeadsSubNav } from "@/components/leads/layout/leads-sub-nav";
import { WorkspacePlatformShell } from "@/components/universal-workspace/workspace-platform-shell";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { NEST_INDEX } from "@/lib/routing";
import { useAuthUser } from "@/hooks/use-rbac";
import { useAuth } from "@/context/auth-context";
import { useLeadsRealtime } from "@/hooks/leads/use-leads-realtime";

function GuardedLeadsRoute({ route }: { route: (typeof LEADS_ROUTE_REGISTRY)[number] }) {
  const { hasPermission, isSuperAdmin } = useAuthUser();
  if (route.permission && !isSuperAdmin && !hasPermission(route.permission)) {
    return null;
  }
  const Page = route.Page;
  return <Page />;
}

export function LeadsLayout() {
  const { company } = useAuth();
  useLeadsRealtime(company?.id ?? null);

  return (
    <WorkspacePlatformShell>
      <div className="space-y-4">
        <LeadsSubNav />
        <Suspense fallback={<DashboardPageFallback />}>
          <Switch>
            <Route path={NEST_INDEX}>
              <Redirect to={LEADS_DEFAULT_NESTED_PATH} />
            </Route>
            {LEADS_ROUTE_REGISTRY.map((route) => (
              <Route key={route.id} path={route.nestedPath}>
                <GuardedLeadsRoute route={route} />
              </Route>
            ))}
          </Switch>
        </Suspense>
      </div>
    </WorkspacePlatformShell>
  );
}
