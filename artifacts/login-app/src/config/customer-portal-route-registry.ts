import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

export type PortalRouteDefinition = {
  path: string;
  Page: LazyExoticComponent<ComponentType>;
};

function lazyNamed<T extends Record<string, ComponentType>>(
  loader: () => Promise<T>,
  exportName: keyof T,
) {
  return lazy(() => loader().then((m) => ({ default: m[exportName] as ComponentType })));
}

export const PUBLIC_BOOKING_ROUTES: PortalRouteDefinition[] = [
  {
    path: "/book/:slug",
    Page: lazyNamed(() => import("@/pages/portal/public-booking-landing-page"), "PublicBookingLandingPage"),
  },
  {
    path: "/book/:slug/flow",
    Page: lazyNamed(() => import("@/pages/portal/public-booking-flow-page"), "PublicBookingFlowPage"),
  },
  {
    path: "/portal/:slug",
    Page: lazyNamed(() => import("@/pages/portal/customer-portal-dashboard-page"), "CustomerPortalDashboardPage"),
  },
  {
    path: "/portal/:slug/login",
    Page: lazyNamed(() => import("@/pages/portal/customer-portal-login-page"), "CustomerPortalLoginPage"),
  },
  {
    path: "/check-in/:token",
    Page: lazyNamed(() => import("@/pages/portal/customer-check-in-page"), "CustomerCheckInPage"),
  },
];
