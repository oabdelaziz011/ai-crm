import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalyticsReadPort, AnalyticsMetricModel } from "@workspace/application-layer";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";
import { ExecutiveAnalyticsDataLoader } from "../executive-analytics-data-loader.js";

function canReadAnalytics(ctx: LoginAppPortContext): boolean {
  return ctx.isSuperAdmin || ctx.hasPermission("analytics.read") || ctx.hasPermission("dashboard.read") || ctx.hasPermission("executive.view");
}

function formatMetric(kpi: { key: string; label: string; value: number; unit?: string; previousValue?: number }, currency: string): AnalyticsMetricModel {
  const value =
    kpi.unit === "currency"
      ? new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(kpi.value / 100)
      : kpi.unit === "percent"
        ? `${kpi.value.toFixed(1)}%`
        : String(Math.round(kpi.value));
  const trend =
    kpi.previousValue != null && kpi.previousValue > 0
      ? `${kpi.value >= kpi.previousValue ? "+" : ""}${Math.round(((kpi.value - kpi.previousValue) / kpi.previousValue) * 100)}%`
      : undefined;
  return Object.freeze({ id: kpi.key, label: kpi.label, value, trend });
}

export function createLoginAppAnalyticsReadPort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): AnalyticsReadPort {
  const loader = new ExecutiveAnalyticsDataLoader(client);

  return {
    async getMetrics(tenantId, _templateKey, metrics) {
      if (tenantId !== ctx.companyId || !canReadAnalytics(ctx)) return [];
      const snapshot = await loader.loadExecutiveSnapshot(tenantId, { period: "today", comparePrevious: true });
      const all = snapshot.kpis.map((kpi) => formatMetric(kpi, snapshot.currency));
      if (!metrics?.length) return all;
      return all.filter((metric) => metrics.includes(metric.id));
    },

    async getExecutiveSnapshot(tenantId, filter) {
      if (tenantId !== ctx.companyId || !canReadAnalytics(ctx)) {
        throw new Error("Permission denied");
      }
      return loader.loadExecutiveSnapshot(tenantId, filter);
    },
  };
}
