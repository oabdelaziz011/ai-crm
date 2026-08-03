import type { ComponentType, LazyExoticComponent } from "react";
import { lazy } from "react";

export const UNIVERSAL_OPERATIONS_BASE_NESTED_PATH = "/operations";

export type UniversalOperationsRouteId =
  | "hub"
  | "queue"
  | "calendar"
  | "kanban"
  | "timeline"
  | "configuration"
  | "analytics"
  | "designer";

export type UniversalOperationsRouteDefinition = {
  id: UniversalOperationsRouteId;
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

export const UNIVERSAL_OPERATIONS_ROUTE_REGISTRY: readonly UniversalOperationsRouteDefinition[] = [
  {
    id: "hub",
    nestedPath: "/hub",
    titleKey: "universalOperations.nav.hub",
    Page: lazyNamed(() => import("@/pages/dashboard/operations/workspace-hub-page"), "WorkspaceHubPage"),
  },
  {
    id: "queue",
    nestedPath: "/queue",
    titleKey: "universalOperations.nav.queue",
    Page: lazyNamed(() => import("@/pages/dashboard/operations/operations-queue-page"), "OperationsQueuePage"),
  },
  {
    id: "calendar",
    nestedPath: "/calendar",
    titleKey: "universalOperations.nav.calendar",
    Page: lazyNamed(() => import("@/pages/dashboard/operations/operations-calendar-page"), "OperationsCalendarPage"),
  },
  {
    id: "kanban",
    nestedPath: "/kanban",
    titleKey: "universalOperations.nav.kanban",
    Page: lazyNamed(() => import("@/pages/dashboard/operations/operations-kanban-page"), "OperationsKanbanPage"),
  },
  {
    id: "timeline",
    nestedPath: "/timeline",
    titleKey: "universalOperations.nav.timeline",
    Page: lazyNamed(() => import("@/pages/dashboard/operations/operations-timeline-page"), "OperationsTimelinePage"),
  },
  {
    id: "configuration",
    nestedPath: "/configuration",
    titleKey: "universalOperations.nav.configuration",
    permission: "operations.universal.configure",
    Page: lazyNamed(
      () => import("@/pages/dashboard/operations/operations-configuration-page"),
      "OperationsConfigurationPage",
    ),
  },
  {
    id: "analytics",
    nestedPath: "/analytics",
    titleKey: "universalOperations.nav.analytics",
    Page: lazyNamed(() => import("@/pages/dashboard/operations/operations-analytics-page"), "OperationsAnalyticsPage"),
  },
  {
    id: "designer",
    nestedPath: "/designer",
    titleKey: "universalOperations.nav.designer",
    permission: "operations.universal.configure",
    Page: lazyNamed(() => import("@/pages/dashboard/operations/workspace-designer-page"), "WorkspaceDesignerPage"),
  },
];

export const UNIVERSAL_OPERATIONS_DEFAULT_NESTED_PATH = "/queue";

export function universalOperationsNavItems() {
  return UNIVERSAL_OPERATIONS_ROUTE_REGISTRY;
}
