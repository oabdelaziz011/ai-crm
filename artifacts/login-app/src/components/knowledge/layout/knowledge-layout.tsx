import { Suspense } from "react";
import { Route, Switch, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { KNOWLEDGE_ROUTE_REGISTRY } from "@/config/knowledge-route-registry";
import { KnowledgeRouteGuard } from "@/components/knowledge/layout/knowledge-route-guard";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";

function GuardedRoute({ route }: { route: (typeof KNOWLEDGE_ROUTE_REGISTRY)[number] }) {
  const Page = route.Page;
  return <KnowledgeRouteGuard route={route} Page={Page} />;
}

export function KnowledgeLayout() {
  const { t } = useTranslation("common");
  const [location] = useLocation();
  const onWizard = location === "/new" || location.startsWith("/new?");

  return (
    <div className="space-y-5">
      {!onWizard ? (
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("knowledge.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("knowledge.subtitle")}</p>
        </div>
      ) : null}

      <Suspense fallback={<DashboardPageFallback />}>
        <Switch>
          {KNOWLEDGE_ROUTE_REGISTRY.map((route) => (
            <Route key={route.id} path={route.nestedPath}>
              <GuardedRoute route={route} />
            </Route>
          ))}
        </Switch>
      </Suspense>
    </div>
  );
}
