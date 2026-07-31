import type { DashboardMetric, DashboardQuery, DashboardQueryFilter, DashboardSnapshot } from "./types.js";

export function applyDashboardQuery(
  snapshot: DashboardSnapshot,
  query: DashboardQuery,
): DashboardSnapshot {
  const filter = query.filter;
  if (!filter) return snapshot;

  let metrics = snapshot.metrics;

  if (filter.categories?.length) {
    const allowed = new Set(filter.categories.map(String));
    metrics = metrics.filter((metric) => allowed.has(String(metric.category)));
  }

  if (filter.metricKeys?.length) {
    const allowed = new Set(filter.metricKeys.map(String));
    metrics = metrics.filter((metric) => allowed.has(metric.key));
  }

  if (filter.providerIds?.length) {
    const allowedProviders = new Set(filter.providerIds.map(String));
    const allowedCategories = new Set(
      snapshot.providers
        .filter((provider) => allowedProviders.has(provider.providerId))
        .map((provider) => String(provider.category)),
    );
    metrics = metrics.filter((metric) => allowedCategories.has(String(metric.category)));
  }

  return {
    ...snapshot,
    metrics,
  };
}

export class DashboardQueryService {
  execute(snapshot: DashboardSnapshot, query: DashboardQuery): DashboardSnapshot {
    return applyDashboardQuery(snapshot, query);
  }
}

export const dashboardQueryService = new DashboardQueryService();

export function buildDashboardQuery(input: {
  companyId: string;
  categories?: DashboardQueryFilter["categories"];
  providerIds?: string[];
  metricKeys?: string[];
  scope?: DashboardQuery["scope"];
}): DashboardQuery {
  return {
    companyId: input.companyId,
    filter: {
      categories: input.categories,
      providerIds: input.providerIds,
      metricKeys: input.metricKeys,
    },
    scope: input.scope,
  };
}

export type { DashboardQuery };
