import type { DashboardMetricProvider } from "../types.js";
import { assertProviderTenant, buildDashboardMetric } from "./metric-builder.js";
import {
  CHANNELS_METRICS_PROVIDER_ID,
  CHANNELS_VIEW_PERMISSION,
  type ChannelsMetricsPort,
} from "./ports/dashboard-metrics-ports.js";

export function createChannelsMetricsProvider(port: ChannelsMetricsPort): DashboardMetricProvider {
  return {
    providerId: CHANNELS_METRICS_PROVIDER_ID,
    category: "channels",
    requiredPermissions: [CHANNELS_VIEW_PERMISSION],
    async collect(access, input) {
      const capturedAt = new Date().toISOString();
      assertProviderTenant(access.companyId, input.companyId);
      const data = await port.fetchMetrics(input.companyId);

      return {
        providerId: CHANNELS_METRICS_PROVIDER_ID,
        category: "channels",
        companyId: input.companyId,
        capturedAt,
        metrics: [
          buildDashboardMetric(
            "channels.whatsapp",
            "channels",
            "WhatsApp",
            data.whatsappMessages,
            capturedAt,
          ),
          buildDashboardMetric(
            "channels.email",
            "channels",
            "Email",
            data.emailMessages,
            capturedAt,
          ),
          buildDashboardMetric(
            "channels.messenger",
            "channels",
            "Messenger",
            data.messengerMessages,
            capturedAt,
          ),
          buildDashboardMetric(
            "channels.instagram",
            "channels",
            "Instagram",
            data.instagramMessages,
            capturedAt,
          ),
          buildDashboardMetric(
            "channels.failed_deliveries",
            "channels",
            "Failed Deliveries",
            data.failedDeliveries,
            capturedAt,
          ),
        ],
      };
    },
  };
}
