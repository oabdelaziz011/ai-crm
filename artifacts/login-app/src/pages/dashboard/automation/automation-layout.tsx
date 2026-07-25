import { Suspense } from "react";
import { Route, Switch } from "wouter";
import { useTranslation } from "react-i18next";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { AutomationCenterLayout } from "@/pages/dashboard/automation-center/automation-center-layout";
import { AutomationWorkflowsPage } from "@/pages/dashboard/automation/automation-workflows-page";
import { WorkflowBuilderPage } from "@/pages/dashboard/automation/workflow-builder-page";

export function AutomationLayout() {
  const { t } = useTranslation("common");

  return (
    <Switch>
      <Route path="/center/editor/:workflowId">
        <AutomationCenterLayout />
      </Route>
      <Route path="/center/history">
        <AutomationCenterLayout />
      </Route>
      <Route path="/center/templates">
        <AutomationCenterLayout />
      </Route>
      <Route path="/center">
        <AutomationCenterLayout />
      </Route>
      <Route path="/:flowId">
        <Suspense fallback={<DashboardPageFallback />}>
          <WorkflowBuilderPage />
        </Suspense>
      </Route>
      <Route path="/">
        <div className="space-y-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-bold">{t("workflowBuilder.list.title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("workflowBuilder.list.subtitle")}</p>
            </div>
            <a
              href="/dashboard/automation/center"
              className="text-sm text-primary hover:underline"
            >
              {t("automation.center.title")} →
            </a>
          </div>
          <Suspense fallback={<DashboardPageFallback />}>
            <AutomationWorkflowsPage />
          </Suspense>
        </div>
      </Route>
    </Switch>
  );
}
