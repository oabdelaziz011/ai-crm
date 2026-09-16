import { Suspense } from "react";
import { Route, Switch } from "wouter";
import { useTranslation } from "react-i18next";
import { SMS_ROUTE_REGISTRY } from "@/config/sms-route-registry";
import { SmsRouteGuard } from "@/components/sms/layout/sms-route-guard";
import { SmsSubNav } from "@/components/sms/layout/sms-sub-nav";
import { ModulePageHeader } from "@/components/dashboard/module-page-header";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";

function GuardedRoute({ route }: { route: (typeof SMS_ROUTE_REGISTRY)[number] }) {
  const Page = route.Page;
  return <SmsRouteGuard route={route} Page={Page} />;
}

export function SmsLayout() {
  const { t } = useTranslation("common");

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden px-3 py-2 md:px-4"
      data-testid="sms-module-shell"
    >
      <header className="shrink-0 border-b border-border pb-1.5" data-testid="sms-module-page-header">
        <ModulePageHeader
          title={t("smsModule.title")}
          subtitle={t("smsModule.subtitle")}
          compact
          className="gap-1 border-0 pb-1 sm:items-center"
        />
        <SmsSubNav />
      </header>

      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden pt-2">
        <Suspense fallback={<DashboardPageFallback />}>
          <Switch>
            {SMS_ROUTE_REGISTRY.map((route) => (
              <Route key={route.id} path={route.nestedPath}>
                <GuardedRoute route={route} />
              </Route>
            ))}
          </Switch>
        </Suspense>
      </div>
    </div>
  );
}
