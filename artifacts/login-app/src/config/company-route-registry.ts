import type { ComponentType, LazyExoticComponent } from "react";
import { lazy } from "react";

export const COMPANY_BASE_NESTED_PATH = "/company";

export type CompanyRouteId = "overview" | "branches";

export type CompanyRouteDefinition = {
  id: CompanyRouteId;
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

export const COMPANY_ROUTE_REGISTRY: readonly CompanyRouteDefinition[] = [
  {
    id: "overview",
    nestedPath: "/",
    titleKey: "dashboard.settings.nav.companySettings",
    permission: "settings.edit",
    Page: lazyNamed(
      () => import("@/pages/dashboard/settings/company/company-overview-page"),
      "CompanyOverviewPage",
    ),
  },
  {
    id: "branches",
    nestedPath: "/branches",
    titleKey: "branches.nav.title",
    permission: "settings.edit",
    Page: lazyNamed(
      () => import("@/pages/dashboard/settings/company/branches-list-page"),
      "BranchesListPage",
    ),
  },
];

export const COMPANY_DEFAULT_NESTED_PATH = "/";

export function companyNavItems() {
  return COMPANY_ROUTE_REGISTRY;
}

export function branchDetailHref(branchId: string): string {
  return `/branches/${branchId}`;
}
