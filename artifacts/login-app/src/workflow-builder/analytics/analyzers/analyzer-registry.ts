import type { WorkflowAnalyticsInput, WorkflowAnalyticsViewModel } from "../types/analytics-types";

export type AnalyticsAnalyzer = {
  id: string;
  analyze(input: WorkflowAnalyticsInput): Partial<WorkflowAnalyticsViewModel>;
};

export type AnalyticsAnalyzerRegistry = {
  register(analyzer: AnalyticsAnalyzer): void;
  analyzeAll(input: WorkflowAnalyticsInput): Partial<WorkflowAnalyticsViewModel>;
  list(): readonly AnalyticsAnalyzer[];
};

export function createAnalyticsAnalyzerRegistry(analyzers: readonly AnalyticsAnalyzer[] = []): AnalyticsAnalyzerRegistry {
  const registry = new Map<string, AnalyticsAnalyzer>();
  for (const analyzer of analyzers) {
    registry.set(analyzer.id, analyzer);
  }

  return {
    register(analyzer) {
      registry.set(analyzer.id, analyzer);
    },
    list() {
      return [...registry.values()];
    },
    analyzeAll(input) {
      return [...registry.values()].reduce<Partial<WorkflowAnalyticsViewModel>>((merged, analyzer) => {
        return { ...merged, ...analyzer.analyze(input) };
      }, {});
    },
  };
}
