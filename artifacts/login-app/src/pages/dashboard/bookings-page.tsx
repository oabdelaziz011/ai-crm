import { Redirect } from "wouter";
import { getDashboardRouteById } from "@/config/dashboard-route-registry";

/**
 * Legacy bookings list module — permanently redirected to Universal Operations.
 * Kept as a route so old bookmarks / deep links still resolve.
 */
export default function BookingsPage() {
  return <Redirect to={getDashboardRouteById("universal-operations").nestedPath} />;
}
