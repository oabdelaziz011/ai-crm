import type { ComponentType, LazyExoticComponent } from "react";
import { lazy } from "react";

export const SCHEDULING_DASHBOARD_BASE_NESTED_PATH = "/scheduling";

export type SchedulingDashboardRouteId =
  | "calendar"
  | "bookings"
  | "availability"
  | "resources"
  | "booking-rules"
  | "holidays"
  | "operations";

export type SchedulingDashboardRouteDefinition = {
  id: SchedulingDashboardRouteId;
  nestedPath: string;
  titleKey: string;
  permission?: string;
  /** When set, navigates outside the scheduling nest (preserves existing routes). */
  externalPath?: string;
  Page?: LazyExoticComponent<ComponentType>;
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

export const SCHEDULING_DASHBOARD_ROUTE_REGISTRY: readonly SchedulingDashboardRouteDefinition[] = [
  {
    id: "calendar",
    nestedPath: "/calendar",
    titleKey: "scheduling.dashboard.nav.calendar",
    permission: "bookings.view",
    externalPath: "/dashboard/calendar",
  },
  {
    id: "bookings",
    nestedPath: "/bookings",
    titleKey: "scheduling.dashboard.nav.bookings",
    permission: "bookings.view",
    /** Legacy bookings list → Universal Operations queue. */
    externalPath: "/dashboard/operations",
  },
  {
    id: "availability",
    nestedPath: "/availability",
    titleKey: "scheduling.dashboard.nav.availability",
    permission: "scheduling.view",
    externalPath: "/dashboard/settings/scheduling/availability",
  },
  {
    id: "resources",
    nestedPath: "/resources",
    titleKey: "scheduling.dashboard.nav.resources",
    permission: "scheduling.view",
    externalPath: "/dashboard/settings/scheduling/resources",
  },
  {
    id: "booking-rules",
    nestedPath: "/booking-rules",
    titleKey: "scheduling.dashboard.nav.bookingRules",
    permission: "scheduling.view",
    externalPath: "/dashboard/settings/scheduling/booking-rules",
  },
  {
    id: "holidays",
    nestedPath: "/holidays",
    titleKey: "scheduling.dashboard.nav.holidays",
    permission: "scheduling.view",
    externalPath: "/dashboard/settings/scheduling/holidays",
  },
  {
    id: "operations",
    nestedPath: "/operations",
    titleKey: "scheduling.dashboard.nav.operations",
    permission: "bookings.view",
    Page: lazyNamed(
      () => import("@/pages/dashboard/scheduling/operations-page"),
      "OperationsPage",
    ),
  },
];

export function schedulingDashboardNavItems() {
  // Calendar lives as its own sidebar module; bookings list → operations.
  return SCHEDULING_DASHBOARD_ROUTE_REGISTRY.filter(
    (route) => route.id !== "bookings" && route.id !== "calendar",
  );
}

export const SCHEDULING_DASHBOARD_DEFAULT_NESTED_PATH = "/operations";
