import { Suspense } from "react";
import { Route, Switch } from "wouter";
import { useTranslation } from "react-i18next";
import { EMAIL_ROUTE_REGISTRY } from "@/config/email-route-registry";
import { EmailRouteGuard } from "@/components/email/layout/email-route-guard";
import { EmailSubNav } from "@/components/email/layout/email-sub-nav";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";

function GuardedRoute({ route }: { route: (typeof EMAIL_ROUTE_REGISTRY)[number] }) {
  const Page = route.Page;
  return <EmailRouteGuard route={route} Page={Page} />;
}

export function EmailLayout() {
  const { t } = useTranslation("common");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("emailModule.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("emailModule.subtitle")}</p>
      </div>

      <EmailSubNav />

      <Suspense fallback={<DashboardPageFallback />}>
        <Switch>
          {EMAIL_ROUTE_REGISTRY.map((route) => (
            <Route key={route.id} path={route.nestedPath}>
              <GuardedRoute route={route} />
            </Route>
          ))}
        </Switch>
      </Suspense>
    </div>
  );
}
