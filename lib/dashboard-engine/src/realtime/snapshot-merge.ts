import type { DashboardSnapshot } from "../types.js";
import { providerOwnsMetric } from "./event-scope-map.js";

export function mergePartialDashboardSnapshot(
  cached: DashboardSnapshot,
  partial: DashboardSnapshot,
  affectedProviderIds: string[],
): DashboardSnapshot {
  if (cached.companyId !== partial.companyId) {
    throw new Error("Cross-company snapshot merge is forbidden.");
  }

  const affected = new Set(affectedProviderIds);
  const retainedMetrics = cached.metrics.filter(
    (metric) => !affectedProviderIds.some((providerId) => providerOwnsMetric(providerId, metric.key)),
  );
  const retainedProviders = cached.providers.filter((provider) => !affected.has(provider.providerId));
  const mergedWarnings = [
    ...cached.warnings.filter((warning) => !partial.warnings.includes(warning)),
    ...partial.warnings,
  ];

  return {
    ...cached,
    capturedAt: partial.capturedAt,
    metrics: [...retainedMetrics, ...partial.metrics],
    providers: [...retainedProviders, ...partial.providers],
    warnings: mergedWarnings,
    refreshTimestamp: partial.refreshTimestamp ?? partial.capturedAt,
  };
}
