import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { KpiEngineService } from "@/lib/executive/analytics/kpi-engine-service";
import { ForecastEngineService } from "@/lib/executive/forecasting/forecast-engine-service";
import { AlertEngineService } from "@/lib/executive/alerts/alert-engine-service";
import { ExecutiveAlertRepository } from "@/lib/executive/repositories/executive-alert-repository";
import { ExecutiveDataRepository } from "@/lib/executive/repositories/executive-data-repository";
import { ExecutiveTimelineService } from "@/lib/executive/services/executive-timeline-service";
import { ExecutiveReportService } from "@/lib/executive/reports/executive-report-service";
import type { ExecutiveContext, ExecutiveDashboardSnapshot, QuickAction } from "@/lib/executive/types";

export type ExecutivePlatformServices = {
  kpis: KpiEngineService;
  forecasts: ForecastEngineService;
  alerts: AlertEngineService;
  timeline: ExecutiveTimelineService;
  reports: ExecutiveReportService;
  data: ExecutiveDataRepository;
};

export function createExecutivePlatformServices(client: SupabaseClient = supabase): ExecutivePlatformServices {
  const alertRepo = new ExecutiveAlertRepository(client);
  return {
    kpis: new KpiEngineService(client),
    forecasts: new ForecastEngineService(),
    alerts: new AlertEngineService(alertRepo),
    timeline: new ExecutiveTimelineService(client),
    reports: new ExecutiveReportService(),
    data: new ExecutiveDataRepository(client),
  };
}

let cached: ExecutivePlatformServices | null = null;

export function getExecutivePlatformServices(): ExecutivePlatformServices {
  if (!cached) cached = createExecutivePlatformServices();
  return cached;
}

export async function buildExecutiveDashboard(context: ExecutiveContext): Promise<ExecutiveDashboardSnapshot> {
  const platform = getExecutivePlatformServices();
  await platform.data.recordAccess(context.companyId);

  const snapshot = await platform.kpis.buildSnapshot(context);
  const raw = await platform.data.loadRawData(context.companyId, context.date, context.branchId);

  snapshot.forecasts = platform.forecasts.buildForecasts(raw);
  snapshot.alerts = await platform.alerts.listActive(context.companyId);

  if (snapshot.alerts.length === 0) {
    const newAlerts = await platform.alerts.evaluateAndPersist(context.companyId, snapshot);
    snapshot.alerts = newAlerts.length > 0 ? newAlerts : snapshot.alerts;
  }

  snapshot.timeline = await platform.timeline.build(context.companyId, snapshot);
  return snapshot;
}

export const EXECUTIVE_QUICK_ACTIONS: QuickAction[] = [
  { id: "financial", labelKey: "executive.actions.financial", path: "/dashboard/financial", icon: "coins" },
  { id: "operations", labelKey: "executive.actions.operations", path: "/dashboard/scheduling/operations", icon: "activity" },
  { id: "communication", labelKey: "executive.actions.communication", path: "/dashboard/communication", icon: "send" },
  { id: "customers", labelKey: "executive.actions.customers", path: "/dashboard/customers", icon: "users" },
  { id: "branches", labelKey: "executive.actions.branches", path: "/dashboard/settings/company/branches", icon: "building" },
];
