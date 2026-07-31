import type {
  DashboardMetric,
  DashboardProviderResult,
  DashboardProviderSnapshot,
  DashboardSnapshot,
} from "./types.js";
import type { DashboardProviderExecution } from "./dashboard-metric-collector.js";

function metricDedupKey(metric: DashboardMetric): string {
  return `${String(metric.category)}:${metric.key}`;
}

export function mergeProviderSnapshots(
  companyId: string,
  executions: DashboardProviderExecution[],
): DashboardSnapshot {
  const capturedAt = new Date().toISOString();
  const metrics: DashboardMetric[] = [];
  const deduped = new Map<string, DashboardMetric>();
  const warnings: string[] = [];
  const providers: DashboardProviderResult[] = [];

  for (const execution of executions) {
    if (execution.status === "failed") {
      providers.push({
        providerId: execution.providerId,
        category: execution.category,
        status: "failed",
        metricCount: 0,
        error: execution.error,
      });
      warnings.push(`Provider "${execution.providerId}" failed: ${execution.error ?? "unknown error"}`);
      continue;
    }

    const snapshot = execution.snapshot as DashboardProviderSnapshot;
    for (const metric of snapshot.metrics) {
      deduped.set(metricDedupKey(metric), metric);
    }

    if (snapshot.warnings?.length) {
      warnings.push(...snapshot.warnings);
    }

    providers.push({
      providerId: execution.providerId,
      category: execution.category,
      status: "success",
      metricCount: snapshot.metrics.length,
      warnings: snapshot.warnings,
    });
  }

  metrics.push(...deduped.values());

  return {
    companyId,
    capturedAt,
    metrics,
    providers,
    warnings,
  };
}

export class DashboardMetricAggregator {
  aggregate(companyId: string, executions: DashboardProviderExecution[]): DashboardSnapshot {
    return mergeProviderSnapshots(companyId, executions);
  }
}
