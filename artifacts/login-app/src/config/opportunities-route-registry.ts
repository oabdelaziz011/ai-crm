import type { ComponentType, LazyExoticComponent } from "react";
import { lazy } from "react";

export const OPPORTUNITIES_BASE_NESTED_PATH = "/opportunities";

export type OpportunitiesRouteId = "pipeline" | "table" | "timeline";

export type OpportunitiesRouteDefinition = {
  id: OpportunitiesRouteId;
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

export const OPPORTUNITIES_ROUTE_REGISTRY: readonly OpportunitiesRouteDefinition[] = [
  {
    id: "pipeline",
    nestedPath: "/pipeline",
    titleKey: "opportunities.nav.pipeline",
    Page: lazyNamed(
      () => import("@/pages/dashboard/opportunities/opportunities-pipeline-page"),
      "OpportunitiesPipelinePage",
    ),
  },
  {
    id: "table",
    nestedPath: "/table",
    titleKey: "opportunities.nav.table",
    Page: lazyNamed(
      () => import("@/pages/dashboard/opportunities/opportunities-table-page"),
      "OpportunitiesTablePage",
    ),
  },
  {
    id: "timeline",
    nestedPath: "/timeline",
    titleKey: "opportunities.nav.timeline",
    Page: lazyNamed(
      () => import("@/pages/dashboard/opportunities/opportunities-timeline-page"),
      "OpportunitiesTimelinePage",
    ),
  },
];

export const OPPORTUNITIES_DEFAULT_NESTED_PATH = "/pipeline";

export function opportunitiesNavItems() {
  return OPPORTUNITIES_ROUTE_REGISTRY;
}
