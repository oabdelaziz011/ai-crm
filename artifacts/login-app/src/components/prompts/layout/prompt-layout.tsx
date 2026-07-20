import { Suspense } from "react";
import { Route, Switch } from "wouter";
import { useTranslation } from "react-i18next";
import { PROMPT_ROUTE_REGISTRY } from "@/config/prompt-route-registry";
import { PromptRouteGuard } from "@/components/prompts/layout/prompt-route-guard";
import { PromptSubNav } from "@/components/prompts/layout/prompt-sub-nav";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";

function GuardedRoute({ route }: { route: (typeof PROMPT_ROUTE_REGISTRY)[number] }) {
  const Page = route.Page;
  return <PromptRouteGuard route={route} Page={Page} />;
}

export function PromptLayout() {
  const { t } = useTranslation("common");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("prompts.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("prompts.subtitle")}</p>
      </div>

      <PromptSubNav />

      <Suspense fallback={<DashboardPageFallback />}>
        <Switch>
          {PROMPT_ROUTE_REGISTRY.map((route) => (
            <Route key={route.id} path={route.nestedPath}>
              <GuardedRoute route={route} />
            </Route>
          ))}
        </Switch>
      </Suspense>
    </div>
  );
}
