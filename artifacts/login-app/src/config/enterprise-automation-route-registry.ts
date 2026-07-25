import type { ComponentType, LazyExoticComponent } from "react";
import { lazy } from "react";

export const AUTOMATION_CENTER_BASE = "/center";

export type AutomationCenterRouteId = "workflows" | "editor" | "history" | "templates";

export type AutomationCenterRouteDefinition = {
  id: AutomationCenterRouteId;
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

export const AUTOMATION_CENTER_ROUTES: readonly AutomationCenterRouteDefinition[] = [
  {
    id: "workflows",
    nestedPath: "/",
    titleKey: "automation.center.nav.workflows",
    permission: "automation.view",
    Page: lazyNamed(
      () => import("@/pages/dashboard/automation-center/automation-center-workflows-page"),
      "AutomationCenterWorkflowsPage",
    ),
  },
  {
    id: "editor",
    nestedPath: "/editor/:workflowId",
    titleKey: "automation.center.nav.editor",
    permission: "automation.edit",
    Page: lazyNamed(
      () => import("@/pages/dashboard/automation-center/automation-center-editor-page"),
      "AutomationCenterEditorPage",
    ),
  },
  {
    id: "history",
    nestedPath: "/history",
    titleKey: "automation.center.nav.history",
    permission: "automation.view",
    Page: lazyNamed(
      () => import("@/pages/dashboard/automation-center/automation-center-history-page"),
      "AutomationCenterHistoryPage",
    ),
  },
  {
    id: "templates",
    nestedPath: "/templates",
    titleKey: "automation.center.nav.templates",
    permission: "automation.view",
    Page: lazyNamed(
      () => import("@/pages/dashboard/automation-center/automation-center-templates-page"),
      "AutomationCenterTemplatesPage",
    ),
  },
] as const;
