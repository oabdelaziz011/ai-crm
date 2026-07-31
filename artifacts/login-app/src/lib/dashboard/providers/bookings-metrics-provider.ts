import type {
  DashboardAccess,
  DashboardCollectInput,
  DashboardMetricProvider,
} from "@workspace/dashboard-engine";
import { buildDashboardMetric } from "@workspace/dashboard-engine";
import type { BookingsMetricsData } from "@/lib/dashboard/adapters/supabase-dashboard-metrics-ports";

export const BOOKINGS_METRICS_PROVIDER_ID = "bookings";
export const BOOKINGS_VIEW_PERMISSION = "bookings.view";

export function createBookingsMetricsProvider(port: {
  fetchMetrics(companyId: string): Promise<BookingsMetricsData>;
}): DashboardMetricProvider {
  return {
    providerId: BOOKINGS_METRICS_PROVIDER_ID,
    category: "system",
    requiredPermissions: [BOOKINGS_VIEW_PERMISSION],
    async collect(access, input: DashboardCollectInput) {
      if (access.companyId !== input.companyId) {
        throw new Error("Cross-company metric collection is forbidden.");
      }

      const capturedAt = new Date().toISOString();
      const data = await port.fetchMetrics(input.companyId);

      return {
        providerId: BOOKINGS_METRICS_PROVIDER_ID,
        category: "system",
        companyId: input.companyId,
        capturedAt,
        metrics: [
          buildDashboardMetric(
            "bookings.total",
            "system",
            "Bookings",
            data.bookings,
            capturedAt,
            data.bookingsChangePercent != null
              ? { metadata: { changePercent: data.bookingsChangePercent } }
              : undefined,
          ),
        ],
      };
    },
  };
}
