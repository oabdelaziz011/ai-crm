import type { DashboardSnapshot } from "../types.js";
import type { DashboardExecutiveInsightBundle, DashboardInsightThresholds } from "./insight-types.js";
import { DEFAULT_INSIGHT_THRESHOLDS } from "./insight-types.js";
import type { DashboardInsightContext, InsightProvider } from "./ports/insight-provider-ports.js";
import { RuleBasedInsightProvider } from "./rule-based-insight-provider.js";

export type DashboardInsightEngineOptions = {
  provider?: InsightProvider;
  thresholds?: DashboardInsightThresholds;
};

export class DashboardInsightEngine {
  private readonly provider: InsightProvider;

  constructor(options: DashboardInsightEngineOptions = {}) {
    this.provider = options.provider ?? new RuleBasedInsightProvider(options.thresholds ?? DEFAULT_INSIGHT_THRESHOLDS);
  }

  enrich(snapshot: DashboardSnapshot, context: DashboardInsightContext): DashboardSnapshot {
    const executiveInsights = this.provider.generate(snapshot, context);
    return this.attachInsights(snapshot, executiveInsights);
  }

  attachInsights(
    snapshot: DashboardSnapshot,
    executiveInsights: DashboardExecutiveInsightBundle,
  ): DashboardSnapshot {
    return {
      ...snapshot,
      executiveInsights,
      refreshTimestamp: snapshot.refreshTimestamp ?? executiveInsights.generatedAt,
    };
  }
}

export const createDashboardInsightEngine = (options?: DashboardInsightEngineOptions) =>
  new DashboardInsightEngine(options);
