import type { DashboardMetricRegistry } from "./dashboard-metric-registry.js";
import { DashboardMetricAggregator } from "./dashboard-metric-aggregator.js";
import { DashboardMetricCollector } from "./dashboard-metric-collector.js";
import { applyDashboardQuery } from "./dashboard-query.js";
import { assertDashboardAccess } from "./dashboard-permission-service.js";
import type { DashboardAccess, DashboardQuery, DashboardSnapshot } from "./types.js";

export type DashboardEngineOptions = {
  registry: DashboardMetricRegistry;
};

export class DashboardEngine {
  private readonly registry: DashboardMetricRegistry;
  private readonly collector: DashboardMetricCollector;
  private readonly aggregator: DashboardMetricAggregator;

  constructor(options: DashboardEngineOptions) {
    this.registry = options.registry;
    this.collector = new DashboardMetricCollector(this.registry);
    this.aggregator = new DashboardMetricAggregator();
  }

  listProviders() {
    return this.registry.listProviders();
  }

  async snapshot(access: DashboardAccess, query: DashboardQuery): Promise<DashboardSnapshot> {
    const validatedAccess = assertDashboardAccess(access, query);

    const executions = await this.collector.collect(validatedAccess, {
      companyId: query.companyId,
      filter: query.filter,
      scope: query.scope,
    });

    const merged = this.aggregator.aggregate(query.companyId, executions);
    return applyDashboardQuery(merged, query);
  }
}

export type { DashboardSnapshot };
