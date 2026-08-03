import type { ComponentType, LazyExoticComponent } from "react";
import { lazy } from "react";

export const LEADS_BASE_NESTED_PATH = "/leads";

export type LeadsRouteId = "table" | "kanban" | "pipeline" | "timeline" | "dashboard";

export type LeadsRouteDefinition = {
  id: LeadsRouteId;
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

export const LEADS_ROUTE_REGISTRY: readonly LeadsRouteDefinition[] = [
  {
    id: "table",
    nestedPath: "/table",
    titleKey: "leads.nav.table",
    Page: lazyNamed(() => import("@/pages/dashboard/leads/leads-table-page"), "LeadsTablePage"),
  },
  {
    id: "kanban",
    nestedPath: "/kanban",
    titleKey: "leads.nav.kanban",
    Page: lazyNamed(() => import("@/pages/dashboard/leads/leads-kanban-page"), "LeadsKanbanPage"),
  },
  {
    id: "pipeline",
    nestedPath: "/pipeline",
    titleKey: "leads.nav.pipeline",
    Page: lazyNamed(() => import("@/pages/dashboard/leads/leads-pipeline-page"), "LeadsPipelinePage"),
  },
  {
    id: "timeline",
    nestedPath: "/timeline",
    titleKey: "leads.nav.timeline",
    Page: lazyNamed(() => import("@/pages/dashboard/leads/leads-timeline-page"), "LeadsTimelinePage"),
  },
  {
    id: "dashboard",
    nestedPath: "/dashboard",
    titleKey: "leads.nav.dashboard",
    Page: lazyNamed(() => import("@/pages/dashboard/leads/leads-dashboard-page"), "LeadsDashboardPage"),
  },
];

export const LEADS_DEFAULT_NESTED_PATH = "/table";

export function leadsNavItems() {
  return LEADS_ROUTE_REGISTRY;
}
