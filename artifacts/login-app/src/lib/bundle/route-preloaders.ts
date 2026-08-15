import type { DashboardSectionId } from "@/config/dashboard-route-registry";

type RoutePreloader = () => Promise<unknown>;

/** Dynamic import loaders for dashboard sections — used for hover/intent preloading only. */
export const DASHBOARD_ROUTE_PRELOADERS: Partial<Record<DashboardSectionId, RoutePreloader>> = {
  company: () => import("@/pages/dashboard/company/company-workspace-page"),
  customers: () => import("@/pages/dashboard/customers/customers-layout"),
  bookings: () => import("@/pages/dashboard/operations/operations-page"),
  "universal-operations": () => import("@/pages/dashboard/operations/operations-page"),
  calendar: () => import("@/pages/dashboard/calendar/calendar-page"),
  reports: () => import("@/pages/dashboard/reports-page"),
  "ai-assistant": () => import("@/pages/ai-assistant"),
  "ai-chat": () => import("@/pages/dashboard/ai-chat-page"),
  knowledge: () => import("@/pages/knowledge"),
  settings: () => import("@/pages/dashboard/settings-page"),
};

const preloaded = new Set<DashboardSectionId>();

/** Preload a dashboard route chunk once (no-op if unknown or already requested). */
export function preloadDashboardRoute(sectionId: DashboardSectionId): void {
  if (preloaded.has(sectionId)) return;
  const loader = DASHBOARD_ROUTE_PRELOADERS[sectionId];
  if (!loader) return;
  preloaded.add(sectionId);
  void loader();
}

/** Preload the most likely next route from the dashboard home shell. */
export function preloadLikelyNextRoute(currentSectionId: DashboardSectionId | null): void {
  if (currentSectionId === null) {
    preloadDashboardRoute("customers");
    return;
  }
  if (currentSectionId === "customers") {
    preloadDashboardRoute("universal-operations");
  }
}
