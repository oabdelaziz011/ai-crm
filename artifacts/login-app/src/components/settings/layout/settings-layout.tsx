import { Suspense } from "react";
import { Redirect, Route, Switch } from "wouter";
import { useTranslation } from "react-i18next";
import {
  SETTINGS_DEFAULT_NESTED_PATH,
  SETTINGS_ROUTE_REGISTRY,
} from "@/config/settings-route-registry";
import { safeArray } from "@/lib/profile/display-safe";
import { SettingsRouteGuard } from "@/components/settings/layout/settings-route-guard";
import { SettingsSubNav } from "@/components/settings/layout/settings-sub-nav";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { NEST_INDEX } from "@/lib/routing";

function SettingsRoute({ route }: { route: (typeof SETTINGS_ROUTE_REGISTRY)[number] }) {
  return <SettingsRouteGuard route={route} Page={route.Page} />;
}

export function SettingsLayout() {
  const { t } = useTranslation("common");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("dashboard.settings.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("dashboard.settings.subtitle")}</p>
      </div>

      <SettingsSubNav />

      <Suspense fallback={<DashboardPageFallback />}>
        <Switch>
          <Route path={NEST_INDEX}>
            <Redirect to={SETTINGS_DEFAULT_NESTED_PATH} />
          </Route>
          {safeArray([...SETTINGS_ROUTE_REGISTRY]).map((route) =>
            route.id === "scheduling" || route.id === "company-settings" ? (
              <Route key={route.id} path={route.nestedPath} nest>
                <SettingsRoute route={route} />
              </Route>
            ) : (
              <Route key={route.id} path={route.nestedPath}>
                <SettingsRoute route={route} />
              </Route>
            ),
          )}
        </Switch>
      </Suspense>
    </div>
  );
}
