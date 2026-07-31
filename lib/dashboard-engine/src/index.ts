export * from "./types.js";
export * from "./errors.js";
export { DashboardErrors } from "./errors.js";
export * from "./dashboard-metric-registry.js";
export * from "./dashboard-permission-service.js";
export * from "./dashboard-metric-collector.js";
export * from "./dashboard-metric-aggregator.js";
export * from "./dashboard-query.js";
export * from "./dashboard-engine.js";

// Public aliases requested by sprint spec
export {
  DashboardMetricRegistry,
  globalDashboardMetricRegistry,
} from "./dashboard-metric-registry.js";
export {
  DashboardPermissionService,
  dashboardPermissionService,
  assertDashboardAccess,
  DASHBOARD_VIEW_PERMISSION,
} from "./dashboard-permission-service.js";
export { DashboardMetricCollector } from "./dashboard-metric-collector.js";
export {
  DashboardMetricAggregator,
  mergeProviderSnapshots,
} from "./dashboard-metric-aggregator.js";
export {
  DashboardQueryService,
  dashboardQueryService,
  applyDashboardQuery,
  buildDashboardQuery,
} from "./dashboard-query.js";
export { DashboardEngine } from "./dashboard-engine.js";
export type { DashboardMetricProvider } from "./types.js";
export type { DashboardAccess } from "./types.js";
export type { DashboardSnapshot, DashboardProviderSnapshot } from "./types.js";
export * from "./analytics/index.js";
export * from "./insights/index.js";
export * from "./realtime/index.js";
export * from "./providers/index.js";
