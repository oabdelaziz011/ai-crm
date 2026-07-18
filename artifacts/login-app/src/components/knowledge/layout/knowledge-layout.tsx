import { Suspense } from "react";
import { Route, Switch } from "wouter";
import { useTranslation } from "react-i18next";
import { KNOWLEDGE_ROUTE_REGISTRY } from "@/config/knowledge-route-registry";
import { KnowledgeRouteGuard } from "@/components/knowledge/layout/knowledge-route-guard";
import { KnowledgeSubNav } from "@/components/knowledge/layout/knowledge-sub-nav";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";

function GuardedRoute({ route }: { route: (typeof KNOWLEDGE_ROUTE_REGISTRY)[number] }) {
  const Page = route.Page;
  return <KnowledgeRouteGuard route={route} Page={Page} />;
}

export function KnowledgeLayout() {
  const { t } = useTranslation("common");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("knowledge.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("knowledge.subtitle")}</p>
      </div>

      <KnowledgeSubNav />

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
