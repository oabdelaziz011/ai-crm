import { analyzeBranchUsage } from "../services/branch-analyzer";
import { analyzeCoverageAnalytics } from "../services/coverage-analytics";
import { analyzeFailures } from "../services/failure-analyzer";
import { generateWorkflowHeatmap } from "../services/heatmap-generator";
import { aggregateDashboardMetrics, aggregatePerformanceMetrics } from "../services/metrics-aggregator";
import { analyzeExecutionTrends } from "../services/trend-analyzer";
import { analyzeTriggerUsage } from "../services/trigger-analyzer";
import type { AnalyticsAnalyzer } from "./analyzer-registry";

export const metricsAnalyzer: AnalyticsAnalyzer = {
  id: "metrics",
  analyze(input) {
    const triggerExecutions = input.triggerAnalytics?.executions ?? 0;
    const dashboard = aggregateDashboardMetrics({
      runHistory: input.runHistory,
      latestRun: input.latestRun,
      triggerExecutions,
    });
    const profilerExecutionCount = input.profilerEntries.reduce((sum, entry) => sum + entry.executionCount, 0);
    const branchExecutionCount = input.hotPaths.reduce((sum, entry) => sum + entry.visitCount, 0);
    const performance = aggregatePerformanceMetrics({
      runHistory: input.runHistory,
      profilerExecutionCount,
      branchExecutionCount,
    });
    return { dashboard, performance };
  },
};

export const trendAnalyzer: AnalyticsAnalyzer = {
  id: "trend",
  analyze(input) {
    return { trends: analyzeExecutionTrends(input.runHistory) };
  },
};

export const coverageAnalyzer: AnalyticsAnalyzer = {
  id: "coverage",
  analyze(input) {
    return {
      coverage: analyzeCoverageAnalytics({
        latestRun: input.latestRun,
        simulationReport: input.simulationReport,
      }),
    };
  },
};

export const failureAnalyzer: AnalyticsAnalyzer = {
  id: "failure",
  analyze(input) {
    return { failures: analyzeFailures(input.document, input.runHistory) };
  },
};

export const branchAnalyzer: AnalyticsAnalyzer = {
  id: "branch",
  analyze(input) {
    return { branches: analyzeBranchUsage(input.document, input.runHistory) };
  },
};

export const triggerAnalyzer: AnalyticsAnalyzer = {
  id: "trigger",
  analyze(input) {
    return { triggers: analyzeTriggerUsage(input.document, input.triggerAnalytics) };
  },
};

export const heatmapAnalyzer: AnalyticsAnalyzer = {
  id: "heatmap",
  analyze(input) {
    const bottlenecks = input.latestRun?.report.bottlenecks ?? [];
    return {
      heatmap: generateWorkflowHeatmap({
        document: input.document,
        runHistory: input.runHistory,
        profilerEntries: input.profilerEntries,
        bottlenecks,
      }),
    };
  },
};

export const builtInAnalyzers: AnalyticsAnalyzer[] = [
  metricsAnalyzer,
  trendAnalyzer,
  coverageAnalyzer,
  failureAnalyzer,
  branchAnalyzer,
  triggerAnalyzer,
  heatmapAnalyzer,
];
