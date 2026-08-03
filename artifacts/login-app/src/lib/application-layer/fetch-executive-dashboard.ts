import type { DashboardSnapshot } from "@workspace/dashboard-engine";
import type { DashboardTimeRangeKey } from "@workspace/dashboard-engine";
import {
  buildApplicationContext,
  createLoginAppApplicationLayerRegistry,
  permissionCodes,
} from "./application-layer-bootstrap.js";
import type { LoginAppPortContext } from "./adapters/customer-read-port-adapter.js";
import { mapExecutiveProjectionToDashboardSnapshot } from "./executive-dashboard-projection-mapper.js";

function mapTimeRangeToPeriod(timeRange: DashboardTimeRangeKey): "today" | "7d" | "30d" | "90d" {
  if (timeRange === "today") return "today";
  if (timeRange === "7d") return "7d";
  if (timeRange === "90d") return "90d";
  return "30d";
}

/** Fetches executive dashboard through DashboardApplicationService + ExecutiveInsightsApplicationService. */
export async function fetchExecutiveDashboardViaApplicationLayer(
  portContext: LoginAppPortContext,
  input: { companyId: string; timeRange: DashboardTimeRangeKey },
): Promise<DashboardSnapshot> {
  const started = Date.now();
  const registry = createLoginAppApplicationLayerRegistry(portContext);
  const services = registry.getServices();
  const context = buildApplicationContext({
    tenantId: input.companyId,
    actorId: portContext.actorUserId,
    permissions: permissionCodes(portContext.hasPermission, portContext.isSuperAdmin),
  });

  const period = mapTimeRangeToPeriod(input.timeRange);

  const [dashboardResult, insightsResult] = await Promise.all([
    services.dashboard.getDashboard({ period, comparePrevious: true, templateKey: "clinic" }, context),
    services.executiveInsights.getInsights({ period, comparePrevious: true }, context),
  ]);

  return mapExecutiveProjectionToDashboardSnapshot({
    companyId: input.companyId,
    dashboard: dashboardResult.data,
    insights: insightsResult.data,
    telemetryMs: Date.now() - started,
  });
}
