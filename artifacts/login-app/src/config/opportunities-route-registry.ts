import type { ComponentType, LazyExoticComponent } from "react";
import { lazy } from "react";

export const OPPORTUNITIES_BASE_NESTED_PATH = "/opportunities";

/** Single module surface — table view only. */
export type OpportunitiesRouteId = "table";

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

/**
 * Opportunities module navigation: exactly one tab ("Opportunities" / "فرص").
 * Legacy /pipeline and /timeline paths redirect to this route in the layout.
 */
export const OPPORTUNITIES_ROUTE_REGISTRY: readonly OpportunitiesRouteDefinition[] = [
  {
    id: "table",
    nestedPath: "/table",
    titleKey: "opportunities.nav.table",
    Page: lazyNamed(
      () => import("@/pages/dashboard/opportunities/opportunities-table-page"),
      "OpportunitiesTablePage",
    ),
  },
];

/** Legacy nested paths that must not reintroduce extra tabs. */
export const OPPORTUNITIES_LEGACY_REDIRECT_PATHS = ["/pipeline", "/timeline"] as const;

export const OPPORTUNITIES_DEFAULT_NESTED_PATH = "/table";

export function opportunitiesNavItems() {
  return OPPORTUNITIES_ROUTE_REGISTRY;
}
