import type { ComponentType, LazyExoticComponent } from "react";
import { lazy } from "react";
import { isUuidSegment } from "@/lib/billing/subscription-status-display";

export const SCHEDULING_BASE_NESTED_PATH = "/scheduling";

export type SchedulingRouteId =
  | "resources"
  | "services"
  | "availability"
  | "booking-rules"
  | "holidays";

export type SchedulingRouteDefinition = {
  id: SchedulingRouteId;
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

export const SCHEDULING_ROUTE_REGISTRY: readonly SchedulingRouteDefinition[] = [
  {
    id: "resources",
    nestedPath: "/resources",
    titleKey: "scheduling.nav.resources",
    permission: "scheduling.view",
    Page: lazyNamed(
      () => import("@/pages/dashboard/settings/scheduling/scheduling-resources-page"),
      "SchedulingResourcesPage",
    ),
  },
  {
    id: "services",
    nestedPath: "/services",
    titleKey: "scheduling.nav.services",
    permission: "scheduling.view",
    Page: lazyNamed(
      () => import("@/pages/dashboard/settings/scheduling/scheduling-services-page"),
      "SchedulingServicesPage",
    ),
  },
  {
    id: "availability",
    nestedPath: "/availability",
    titleKey: "scheduling.nav.availability",
    permission: "scheduling.view",
    Page: lazyNamed(
      () => import("@/pages/dashboard/settings/scheduling/scheduling-availability-page"),
      "SchedulingAvailabilityPage",
    ),
  },
  {
    id: "booking-rules",
    nestedPath: "/booking-rules",
    titleKey: "scheduling.nav.bookingRules",
    permission: "scheduling.view",
    Page: lazyNamed(
      () => import("@/pages/dashboard/settings/scheduling/scheduling-booking-rules-page"),
      "SchedulingBookingRulesPage",
    ),
  },
  {
    id: "holidays",
    nestedPath: "/holidays",
    titleKey: "scheduling.nav.holidays",
    permission: "scheduling.view",
    Page: lazyNamed(
      () => import("@/pages/dashboard/settings/scheduling/scheduling-holidays-page"),
      "SchedulingHolidaysPage",
    ),
  },
] as const;

export const SCHEDULING_DEFAULT_NESTED_PATH = "/resources";

export function schedulingNavItems(): readonly SchedulingRouteDefinition[] {
  return SCHEDULING_ROUTE_REGISTRY;
}

/** Nest-relative paths like /resources/:id or /services/:id */
export function isSchedulingDetailNestPath(location: string): boolean {
  const segments = location.split("/").filter(Boolean);
  if (segments.length < 2) return false;
  const [section, id] = segments;
  return (section === "resources" || section === "services") && isUuidSegment(id);
}

export function schedulingResourceProfileHref(resourceId: string): string {
  return `/resources/${resourceId}`;
}

export function schedulingServiceProfileHref(serviceId: string): string {
  return `/services/${serviceId}`;
}
