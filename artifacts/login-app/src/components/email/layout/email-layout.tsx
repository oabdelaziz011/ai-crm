import { Suspense } from "react";
import { Route, Switch, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { EMAIL_ROUTE_REGISTRY } from "@/config/email-route-registry";
import { EmailRouteGuard } from "@/components/email/layout/email-route-guard";
import { EmailSubNav } from "@/components/email/layout/email-sub-nav";
import { EmailNewEmailButton } from "@/components/email/email-new-email-button";
import { ModulePageHeader } from "@/components/dashboard/module-page-header";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { isNestedSectionActive } from "@/lib/routing";
import { cn } from "@/lib/utils";

function GuardedRoute({ route }: { route: (typeof EMAIL_ROUTE_REGISTRY)[number] }) {
  const Page = route.Page;
  return <EmailRouteGuard route={route} Page={Page} />;
}

/**
 * Route-local email shell — no global dashboard overflow changes.
 *
 * Full-bleed dashboard outlet: this shell fills the remaining viewport under the
 * app header so the inbox list/thread own scrolling.
 */
export function EmailLayout() {
  const { t } = useTranslation("common");
  const [location, setLocation] = useLocation();
  const pathOnly = location.split("?")[0] || "/";
  const isEmailWorkspace =
    isNestedSectionActive(pathOnly, "/") || isNestedSectionActive(pathOnly, "/sent");

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col px-3 py-2 md:px-4",
        isEmailWorkspace && "overflow-hidden",
      )}
      data-testid="email-module-shell"
    >
      <header className="shrink-0 border-b border-border pb-1.5" data-testid="email-module-page-header">
        <ModulePageHeader
          title={t("emailModule.title")}
          subtitle={t("emailModule.subtitle")}
          compact
          className="gap-1 border-0 pb-1 sm:items-center"
          actions={
            isEmailWorkspace ? undefined : (
              <EmailNewEmailButton
                onClick={() => setLocation(`~/dashboard/email?compose=${Date.now()}`)}
              />
            )
          }
        />
        <EmailSubNav />
      </header>

      <div
        className={cn(
          "min-h-0 flex-1 pt-2",
          isEmailWorkspace ? "flex h-full min-h-0 flex-col overflow-hidden" : "overflow-y-auto",
        )}
      >
        <Suspense fallback={<DashboardPageFallback />}>
          <div
            className={cn(
              isEmailWorkspace && "flex h-full min-h-0 flex-1 flex-col overflow-hidden",
            )}
          >
            <Switch>
              {EMAIL_ROUTE_REGISTRY.map((route) => (
                <Route key={route.id} path={route.nestedPath}>
                  <GuardedRoute route={route} />
                </Route>
              ))}
            </Switch>
          </div>
        </Suspense>
      </div>
    </div>
  );
}
