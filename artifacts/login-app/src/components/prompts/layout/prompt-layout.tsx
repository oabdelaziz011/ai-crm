import { Suspense } from "react";
import { Route, Switch } from "wouter";
import { useTranslation } from "react-i18next";
import { Workflow } from "lucide-react";
import { PROMPT_ROUTE_REGISTRY } from "@/config/prompt-route-registry";
import { PromptRouteGuard } from "@/components/prompts/layout/prompt-route-guard";
import { PromptSubNav } from "@/components/prompts/layout/prompt-sub-nav";
import { ModulePurposeBanner } from "@/components/dashboard/module-purpose-banner";
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

      <ModulePurposeBanner
        title={t("prompts.purpose.title")}
        body={t("prompts.purpose.body")}
        points={[
          t("prompts.purpose.point1"),
          t("prompts.purpose.point2"),
          t("prompts.purpose.point3"),
        ]}
        links={[
          {
            href: "~/dashboard/automation",
            label: t("prompts.purpose.openWorkflows"),
            icon: Workflow,
            variant: "secondary",
          },
        ]}
      />

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
