import type { SupabaseClient } from "@supabase/supabase-js";
import type { RevenueReadPort, AnalyticsFilter } from "@workspace/application-layer";
import { RevenueReportService } from "@/lib/billing/reports/revenue-report-service";
import { ExecutiveAnalyticsDataLoader } from "../executive-analytics-data-loader.js";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";

function canReadRevenue(ctx: LoginAppPortContext): boolean {
  return ctx.isSuperAdmin || ctx.hasPermission("analytics.read") || ctx.hasPermission("invoices.view");
}

export function createLoginAppRevenueReadPort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): RevenueReadPort {
  const reports = new RevenueReportService(client);
  const loader = new ExecutiveAnalyticsDataLoader(client);

  return {
    async getSummary(tenantId, period, branchId) {
      if (tenantId !== ctx.companyId || !canReadRevenue(ctx)) {
        throw new Error("Permission denied");
      }
      const snapshot = await loader.loadExecutiveSnapshot(tenantId, {
        period: period as AnalyticsFilter["period"],
        branchId,
        comparePrevious: true,
      });
      const revenue = snapshot.kpis.find((kpi) => kpi.key === "finance.revenue") ?? snapshot.kpis[0];
      const previous = revenue?.previousValue ?? 0;
      const trend =
        previous > 0
          ? `${(revenue?.value ?? 0) >= previous ? "+" : ""}${Math.round((((revenue?.value ?? 0) - previous) / previous) * 100)}%`
          : "0%";
      return Object.freeze({
        totalCents: revenue?.value ?? 0,
        currency: snapshot.currency,
        period,
        trend,
      });
    },

    async getBreakdown(tenantId, dimension, filter) {
      if (tenantId !== ctx.companyId || !canReadRevenue(ctx)) return [];
      const snapshot = await loader.loadExecutiveSnapshot(tenantId, filter);
      if (dimension === "branch") return snapshot.breakdowns.revenueByBranch;
      if (dimension === "employee") return snapshot.breakdowns.revenueByEmployee;
      if (dimension === "service") return snapshot.breakdowns.revenueByService;
      if (dimension === "provider") return snapshot.breakdowns.paymentMethods;
      void reports;
      return [];
    },
  };
}
