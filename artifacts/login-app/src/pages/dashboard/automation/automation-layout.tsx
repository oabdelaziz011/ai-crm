import { Suspense } from "react";
import { Route, Switch } from "wouter";
import { useTranslation } from "react-i18next";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { AutomationWorkflowsPage } from "@/pages/dashboard/automation/automation-workflows-page";
import { WorkflowBuilderPage } from "@/pages/dashboard/automation/workflow-builder-page";

export function AutomationLayout() {
  const { t } = useTranslation("common");

  return (
    <Switch>
      <Route path="/:flowId">
        <Suspense fallback={<DashboardPageFallback />}>
          <WorkflowBuilderPage />
        </Suspense>
      </Route>
      <Route path="/">
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">{t("workflowBuilder.list.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("workflowBuilder.list.subtitle")}</p>
          </div>
          <Suspense fallback={<DashboardPageFallback />}>
            <AutomationWorkflowsPage />
          </Suspense>
        </div>
      </Route>
    </Switch>
  );
}
