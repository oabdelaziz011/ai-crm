import type { ComponentType, LazyExoticComponent } from "react";
import { lazy } from "react";

export const AUTOMATION_BASE_NESTED_PATH = "/automation";

export type AutomationRouteId = "workflows" | "builder";

export type AutomationRouteDefinition = {
  id: AutomationRouteId;
  nestedPath: string;
  titleKey: string;
  permission?: string;
  Page: LazyExoticComponent<ComponentType>;
};

const lazyNamed = <T extends ComponentType>(
  loader: () => Promise<Record<string, T>>,
  exportName: string,
) =>
  lazy(() =>
    loader().then((module) => ({
      default: module[exportName],
    })),
  );

export const AUTOMATION_ROUTE_REGISTRY: readonly AutomationRouteDefinition[] = [
  {
    id: "workflows",
    nestedPath: "/",
    titleKey: "workflowBuilder.list.title",
    permission: "automation.view",
    Page: lazyNamed(() => import("@/pages/dashboard/automation/automation-workflows-page"), "AutomationWorkflowsPage"),
  },
  {
    id: "builder",
    nestedPath: "/:flowId",
    titleKey: "workflowBuilder.builder.title",
    permission: "automation.edit",
    Page: lazyNamed(() => import("@/pages/dashboard/automation/workflow-builder-page"), "WorkflowBuilderPage"),
  },
] as const;
