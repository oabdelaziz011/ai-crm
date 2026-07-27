import { Suspense } from "react";
import { Redirect, Route, Switch } from "wouter";
import { useTranslation } from "react-i18next";
import {
  COMPANY_DEFAULT_NESTED_PATH,
  COMPANY_ROUTE_REGISTRY,
} from "@/config/company-route-registry";
import { CompanyRouteGuard } from "@/components/company/layout/company-route-guard";
import { CompanySubNav } from "@/components/company/layout/company-sub-nav";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { NEST_INDEX } from "@/lib/routing";
import { BranchDetailsPage } from "@/pages/dashboard/settings/company/branch-details-page";

function GuardedRoute({ route }: { route: (typeof COMPANY_ROUTE_REGISTRY)[number] }) {
  const Page = route.Page;
  return <CompanyRouteGuard route={route} Page={Page} />;
}

export function CompanyLayout() {
  const { t } = useTranslation("common");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("dashboard.settings.nav.companySettings")}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t("branches.companySubtitle")}</p>
      </div>

      <CompanySubNav />

      <Suspense fallback={<DashboardPageFallback />}>
        <Switch>
          <Route path={NEST_INDEX}>
            <Redirect to={COMPANY_DEFAULT_NESTED_PATH} />
          </Route>
          <Route path="/branches/:branchId">
            <CompanyRouteGuard
              route={COMPANY_ROUTE_REGISTRY[1]}
              Page={BranchDetailsPage}
            />
          </Route>
          {COMPANY_ROUTE_REGISTRY.map((route) => (
            <Route key={route.id} path={route.nestedPath}>
              <GuardedRoute route={route} />
            </Route>
          ))}
        </Switch>
      </Suspense>
    </div>
  );
}
