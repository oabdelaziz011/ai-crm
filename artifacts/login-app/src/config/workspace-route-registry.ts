import type { ComponentType, LazyExoticComponent } from "react";
import { lazy } from "react";

export const WORKSPACE_BASE_NESTED_PATH = "/workspace";

export type WorkspaceRouteId = "overview" | "usage" | "billing";

export type WorkspaceRouteDefinition = {
  id: WorkspaceRouteId;
  nestedPath: string;
  titleKey: string;
  permission?: string;
  phase: 1 | 2;
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

export const WORKSPACE_ROUTE_REGISTRY: readonly WorkspaceRouteDefinition[] = [
  {
    id: "overview",
    nestedPath: "/",
    titleKey: "workspace.nav.overview",
    phase: 1,
    Page: lazyNamed(() => import("@/pages/dashboard/workspace/workspace-overview-page"), "WorkspaceOverviewPage"),
  },
  {
    id: "usage",
    nestedPath: "/usage",
    titleKey: "workspace.nav.usage",
    phase: 1,
    Page: lazyNamed(() => import("@/pages/dashboard/workspace/workspace-usage-page"), "WorkspaceUsagePage"),
  },
  {
    id: "billing",
    nestedPath: "/billing",
    titleKey: "workspace.nav.billing",
    permission: "billing.view_own",
    phase: 1,
    Page: lazyNamed(
      () => import("@/pages/dashboard/workspace/billing/workspace-billing-page"),
      "WorkspaceBillingPage",
    ),
  },
];

export function workspaceNavItems() {
  return WORKSPACE_ROUTE_REGISTRY;
}
