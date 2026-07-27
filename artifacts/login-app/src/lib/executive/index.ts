/** Executive Intelligence Platform */
export * from "@/lib/executive/types";
export {
  getExecutivePlatformServices,
  createExecutivePlatformServices,
  buildExecutiveDashboard,
  EXECUTIVE_QUICK_ACTIONS,
} from "@/lib/executive/services/executive-platform-service";
export { KpiEngineService } from "@/lib/executive/analytics/kpi-engine-service";
export { ForecastEngineService } from "@/lib/executive/forecasting/forecast-engine-service";
export { AlertEngineService } from "@/lib/executive/alerts/alert-engine-service";
export { ExecutiveReportService } from "@/lib/executive/reports/executive-report-service";
export {
  useExecutiveDashboard,
  useExecutiveAlerts,
  useDismissExecutiveAlert,
  useResolveExecutiveAlert,
  useExecutiveReport,
} from "@/lib/executive/hooks/use-executive-dashboard";
export { exportExecutiveReportCsv } from "@/lib/executive/exports/csv-exporter";
export { canViewExecutiveDashboard, EXECUTIVE_PERMISSIONS } from "@/lib/executive/security/executive-permissions";
