import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmployeeReadPort } from "@workspace/application-layer";
import { ExecutiveAnalyticsDataLoader } from "../executive-analytics-data-loader.js";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";

function canReadEmployees(ctx: LoginAppPortContext): boolean {
  return ctx.isSuperAdmin || ctx.hasPermission("analytics.read") || ctx.hasPermission("bookings.view");
}

export function createLoginAppEmployeeReadPort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): EmployeeReadPort {
  const loader = new ExecutiveAnalyticsDataLoader(client);

  return {
    async getWorkload(tenantId, employeeId, date) {
      if (tenantId !== ctx.companyId || !canReadEmployees(ctx)) {
        throw new Error("Permission denied");
      }
      const snapshot = await loader.loadExecutiveSnapshot(tenantId, {
        period: "today",
        employeeId,
        comparePrevious: false,
      });
      const employee = snapshot.rankings.employees.find((item) => item.id === employeeId);
      const utilization = snapshot.kpis.find((kpi) => kpi.key === "operations.utilization");
      return Object.freeze({
        employeeId,
        employeeName: employee?.name ?? "Employee",
        bookingsToday: employee?.count ?? 0,
        hoursScheduled: Math.round((employee?.count ?? 0) * 1.5),
        utilizationPercent: Math.round(utilization?.value ?? 0),
      });
    },

    async listTopEmployees(tenantId, filter, limit = 5) {
      if (tenantId !== ctx.companyId || !canReadEmployees(ctx)) return [];
      const snapshot = await loader.loadExecutiveSnapshot(tenantId, filter);
      return snapshot.rankings.employees.slice(0, limit);
    },
  };
}
