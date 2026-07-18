import { Suspense } from "react";
import { Redirect, Route, Switch } from "wouter";
import { BLOCKED_BILLING_PATHS, BILLING_ROUTE_REGISTRY } from "@/config/billing-route-registry";
import { BillingRouteGuard } from "@/components/billing/layout/billing-route-guard";
import { BillingHealthGate } from "@/components/billing/layout/billing-health-gate";
import { BillingSubNav } from "@/components/billing/layout/billing-sub-nav";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { DashboardErrorBanner } from "@/components/dashboard/ui";
import { BillingHealthProvider, useBillingHealthContext } from "@/context/billing-health-context";
import { NEST_INDEX } from "@/lib/routing";
import { SubscriptionDetailPage } from "@/pages/dashboard/billing/subscription-detail-page";

function BillingDetailRouter() {
  return <SubscriptionDetailPage />;
}

function GuardedRoute({ route }: { route: (typeof BILLING_ROUTE_REGISTRY)[number] }) {
  const Page = route.Page;
  return <BillingRouteGuard route={route} Page={Page} />;
}

function BillingLayoutContent() {
  const { health, isLoading, error } = useBillingHealthContext();

  if (isLoading) {
    return <DashboardPageFallback />;
  }

  if (error) {
    return <DashboardErrorBanner message={error.message} />;
  }

  if (health && !health.healthy) {
    return (
      <div>
        <BillingSubNav />
        <div className="p-6">
          <BillingHealthGate issues={health.issues} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <BillingSubNav />
      <Suspense fallback={<DashboardPageFallback />}>
        <Switch>
          {BLOCKED_BILLING_PATHS.map((path) => (
            <Route key={path} path={path}>
              <Redirect to={NEST_INDEX} />
            </Route>
          ))}
          {BILLING_ROUTE_REGISTRY.map((route) => (
            <Route key={route.id} path={route.nestedPath}>
              <GuardedRoute route={route} />
            </Route>
          ))}
          <Route path="/:companyId" component={BillingDetailRouter} />
        </Switch>
      </Suspense>
    </div>
  );
}

export function BillingLayout() {
  return (
    <BillingHealthProvider>
      <BillingLayoutContent />
    </BillingHealthProvider>
  );
}
