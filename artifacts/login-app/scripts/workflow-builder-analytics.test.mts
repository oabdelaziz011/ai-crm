/**
 * Workflow Builder analytics platform unit tests.
 * Run: pnpm --dir artifacts/login-app test:workflow-builder-analytics
 */
import assert from "node:assert/strict";
import { createBuilderNode } from "../src/workflow-builder/core/persistence/workflow-mapper";
import { registerBuiltInWorkflowNodes } from "../src/workflow-builder/core/register-built-in-nodes";
import { createEdgeFromNodes } from "../src/workflow-builder/core/state/builder-reducer";
import { createAnalyticsAnalyzerRegistry } from "../src/workflow-builder/analytics/analyzers/analyzer-registry";
import { metricsAnalyzer, trendAnalyzer } from "../src/workflow-builder/analytics/analyzers/built-in-analyzers";
import { defaultAnalyticsAnalyzerRegistry } from "../src/workflow-builder/analytics/analyzers/register-built-in-analyzers";
import { builtInKpiCalculators, qualityKpi } from "../src/workflow-builder/analytics/kpis/built-in-kpis";
import { createWorkflowKpiRegistry } from "../src/workflow-builder/analytics/kpis/kpi-registry";
import { defaultWorkflowKpiRegistry } from "../src/workflow-builder/analytics/kpis/register-built-in-kpis";
import {
  CompositeWorkflowAnalyticsDataProvider,
  DebuggerAnalyticsProvider,
  SimulationAnalyticsProvider,
  TestingAnalyticsProvider,
  TriggerAnalyticsProvider,
  createWorkflowAnalyticsDataProvider,
} from "../src/workflow-builder/analytics/providers/workflow-analytics-data-providers";
import {
  buildWorkflowAnalyticsViewModel,
  buildWorkflowAnalyticsViewModelFromProvider,
  WorkflowAnalyticsService,
} from "../src/workflow-builder/analytics/services/analytics-service";
import { analyzeBranchUsage } from "../src/workflow-builder/analytics/services/branch-analyzer";
import { analyzeCoverageAnalytics } from "../src/workflow-builder/analytics/services/coverage-analytics";
import { analyzeFailures } from "../src/workflow-builder/analytics/services/failure-analyzer";
import { generateWorkflowHeatmap } from "../src/workflow-builder/analytics/services/heatmap-generator";
import { calculateWorkflowKpis } from "../src/workflow-builder/analytics/services/kpi-calculator";
import { aggregateDashboardMetrics } from "../src/workflow-builder/analytics/services/metrics-aggregator";
import {
  createWorkflowAnalyticsReportRegistry,
  recommendationSection,
  summarySection,
} from "../src/workflow-builder/analytics/services/report/analytics-report-registry";
import { analyzeExecutionTrends } from "../src/workflow-builder/analytics/services/trend-analyzer";
import { analyzeTriggerUsage } from "../src/workflow-builder/analytics/services/trigger-analyzer";
import {
  mapFailureTrendToChartSeries,
  mapTrendPointsToChartSeries,
} from "../src/workflow-builder/analytics/selectors/analytics-chart-selectors";
import { hasWorkflowAnalyticsPermission } from "../src/workflow-builder/analytics/permissions/workflow-analytics-access";
import type { TestSuiteRunRecord } from "../src/workflow-builder/testing/types/testing-types";

registerBuiltInWorkflowNodes();

console.log("\nWorkflow Builder analytics platform tests\n");

function buildDocument() {
  const start = createBuilderNode("start", { x: 0, y: 0 }, "start-1");
  const branch = createBuilderNode("if_else", { x: 0, y: 120 }, "cond-1");
  const end = createBuilderNode("end", { x: 0, y: 240 }, "end-1");
  return {
    flowId: "flow-1",
    companyId: "company-1",
    name: "Analytics flow",
    description: "",
    triggerType: "inbound_message" as const,
    status: "draft" as const,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [start, branch, end],
    edges: [
      createEdgeFromNodes("start-1", "cond-1"),
      { ...createEdgeFromNodes("cond-1", "end-1"), branchKey: "yes" as const, branchLabel: "Yes" },
    ],
    readOnly: false,
    hasUnpublishedDraft: true,
    versionNumber: 1,
    updatedAt: new Date().toISOString(),
  };
}

function buildRun(partial: Partial<TestSuiteRunRecord> = {}): TestSuiteRunRecord {
  return {
    id: "run-1",
    suiteId: "suite-1",
    suiteName: "Regression",
    companyId: "company-1",
    flowId: "flow-1",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 120,
    passed: 1,
    failed: 0,
    skipped: 0,
    caseResults: [
      {
        caseId: "case-1",
        caseName: "Smoke",
        status: "passed",
        durationMs: 80,
        assertionResults: [],
        coverage: {
          nodeCoveragePercent: 100,
          branchCoveragePercent: 50,
          triggerCoveragePercent: 100,
          assertionCoveragePercent: 100,
          executedNodeIds: ["start-1", "cond-1", "end-1"],
          skippedNodeIds: [],
          totalNodes: 3,
          totalBranches: 1,
        },
        failures: [],
        snapshotSummary: {
          status: "completed",
          currentNodeId: "end-1",
          timelineLength: 3,
          variableCount: 2,
          readinessScore: 92,
        },
      },
    ],
    report: {
      passed: 1,
      failed: 0,
      skipped: 0,
      coverage: {
        nodeCoveragePercent: 100,
        branchCoveragePercent: 50,
        triggerCoveragePercent: 100,
        assertionCoveragePercent: 100,
        executedNodeIds: ["start-1", "cond-1", "end-1"],
        skippedNodeIds: [],
        totalNodes: 3,
        totalBranches: 1,
      },
      warnings: [],
      bottlenecks: [],
      readinessScore: 92,
      exportPayload: {},
    },
    ...partial,
  };
}

const document = buildDocument();
const runHistory = [buildRun()];

function buildInput() {
  return {
    document,
    runHistory,
    latestRun: runHistory[0] ?? null,
    simulationReport: null,
    profilerEntries: [],
    hotPaths: [],
    triggerAnalytics: null,
  };
}

{
  const dashboard = aggregateDashboardMetrics({
    runHistory,
    latestRun: runHistory[0] ?? null,
    triggerExecutions: 5,
  });
  assert.equal(dashboard.executions, 6);
  assert.equal(dashboard.successfulTests, 1);
  assert.equal(dashboard.overallHealth, "healthy");
  console.log("  ✓ metrics aggregator builds dashboard metrics");
}

{
  const trends = analyzeExecutionTrends(runHistory);
  assert.equal(trends.length, 1);
  assert.equal(trends[0]?.successes, 1);
  const chart = mapTrendPointsToChartSeries(trends);
  assert.equal(chart[0]?.value, 1);
  console.log("  ✓ trend analyzer and chart selectors derive historical trends");
}

{
  const branches = analyzeBranchUsage(document, runHistory);
  assert.ok(branches.mostExecutedBranch);
  console.log("  ✓ branch analyzer derives branch usage from coverage");
}

{
  const triggers = analyzeTriggerUsage(document, {
    executions: 10,
    failures: 2,
    averageLatencyMs: 45,
    lastRunAt: new Date().toISOString(),
    lastRunStatus: "completed",
  });
  assert.equal(triggers.successRate, 80);
  console.log("  ✓ trigger analyzer reuses trigger analytics model");
}

{
  const failures = analyzeFailures(document, [
    buildRun({
      caseResults: [
        {
          ...buildRun().caseResults[0]!,
          status: "failed",
          failures: ["Expected path mismatch"],
          snapshotSummary: {
            ...buildRun().caseResults[0]!.snapshotSummary,
            currentNodeId: "cond-1",
          },
        },
      ],
      failed: 1,
      passed: 0,
    }),
  ]);
  assert.equal(failures.commonAssertionFailures[0]?.message, "Expected path mismatch");
  console.log("  ✓ failure analyzer aggregates testing failures");
}

{
  const coverage = analyzeCoverageAnalytics({ latestRun: runHistory[0] ?? null, simulationReport: null });
  assert.equal(coverage.nodeCoveragePercent, 100);
  console.log("  ✓ coverage analytics reuses testing coverage snapshots");
}

{
  const heatmap = generateWorkflowHeatmap({
    document,
    runHistory,
    profilerEntries: [{ nodeId: "cond-1", label: "Condition", executionCount: 3, averageDurationMs: 10, minDurationMs: 5, maxDurationMs: 20, totalDurationMs: 30 }],
    bottlenecks: ["Condition (300ms)"],
  });
  assert.ok(heatmap.some((entry) => entry.nodeId === "cond-1" && entry.executionCount > 0));
  console.log("  ✓ heatmap generator produces presentation-only node intensity");
}

{
  const dashboard = aggregateDashboardMetrics({ runHistory, latestRun: runHistory[0] ?? null, triggerExecutions: 0 });
  const coverage = analyzeCoverageAnalytics({ latestRun: runHistory[0] ?? null, simulationReport: null });
  const kpis = calculateWorkflowKpis({ document, dashboard, coverage });
  assert.ok(kpis.workflowQuality > 0);
  console.log("  ✓ KPI calculator derives quality and stability scores");
}

{
  const viewModel = buildWorkflowAnalyticsViewModel(buildInput());
  assert.ok(viewModel.report.exportPayload.dashboard);
  assert.ok(viewModel.report.recommendations.length >= 0);
  console.log("  ✓ analytics service composes export-ready report");
}

{
  const failedTrend = mapFailureTrendToChartSeries(analyzeExecutionTrends([buildRun({ failed: 1, passed: 0 })]));
  assert.equal(failedTrend[0]?.value, 1);
  console.log("  ✓ chart selectors map failure trends");
}

{
  assert.equal(hasWorkflowAnalyticsPermission(() => true, false), true);
  assert.equal(hasWorkflowAnalyticsPermission(() => false, false), false);
  assert.equal(hasWorkflowAnalyticsPermission(() => false, true), true);
  console.log("  ✓ analytics permission gates read-only access with automation.view");
}

{
  const provider = createWorkflowAnalyticsDataProvider({
    document,
    readSimulation: () => ({ simulationReport: null }),
    readTesting: () => ({ runHistory, latestRun: runHistory[0] ?? null }),
    readDebugger: () => ({ profilerEntries: [], hotPaths: [] }),
    readTrigger: () => ({ triggerAnalytics: { executions: 3, failures: 0, averageLatencyMs: 10, lastRunAt: null, lastRunStatus: null } }),
  });
  assert.ok(provider.read().runHistory.length === 1);
  assert.equal(provider.read().triggerAnalytics?.executions, 3);
  const viewModel = buildWorkflowAnalyticsViewModelFromProvider(provider);
  assert.equal(viewModel.triggers.executions, 3);
  console.log("  ✓ provider abstraction composes read-only analytics input");
}

{
  assert.ok(defaultAnalyticsAnalyzerRegistry.list().length >= 7);
  const customRegistry = createAnalyticsAnalyzerRegistry([metricsAnalyzer, trendAnalyzer]);
  const analyzed = customRegistry.analyzeAll(buildInput());
  assert.ok(analyzed.dashboard);
  assert.ok(analyzed.trends);
  defaultAnalyticsAnalyzerRegistry.register({
    id: "plugin-metrics",
    analyze: () => ({ dashboard: { executions: 99, successfulTests: 0, failedTests: 0, averageDurationMs: null, readinessScore: null, overallHealth: "unknown" } }),
  });
  assert.ok(defaultAnalyticsAnalyzerRegistry.list().some((entry) => entry.id === "plugin-metrics"));
  console.log("  ✓ analyzer registry supports independent plugin registration");
}

{
  assert.ok(defaultWorkflowKpiRegistry.list().length === 5);
  const customRegistry = createWorkflowKpiRegistry(builtInKpiCalculators);
  const dashboard = aggregateDashboardMetrics({ runHistory, latestRun: runHistory[0] ?? null, triggerExecutions: 0 });
  const coverage = analyzeCoverageAnalytics({ latestRun: runHistory[0] ?? null, simulationReport: null });
  const kpis = customRegistry.calculate({ document, dashboard, coverage });
  assert.ok(kpis.workflowQuality > 0);
  customRegistry.register({
    id: "workflowQuality",
    calculate: () => 42,
  });
  assert.equal(customRegistry.calculate({ document, dashboard, coverage }).workflowQuality, 42);
  assert.equal(qualityKpi.id, "workflowQuality");
  console.log("  ✓ KPI registry supports plugin KPI calculators");
}

{
  const registry = createWorkflowAnalyticsReportRegistry([summarySection, recommendationSection]);
  const viewModel = buildWorkflowAnalyticsViewModel(buildInput());
  const report = registry.buildReport(viewModel);
  assert.ok(report.exportPayload.sections);
  registry.register({
    id: "plugin-summary",
    build: () => ({ exportFragment: { plugin: true } }),
  });
  assert.ok(registry.list().some((section) => section.id === "plugin-summary"));
  console.log("  ✓ report registry aggregates registered sections only");
}

{
  const service = new WorkflowAnalyticsService();
  const provider = new CompositeWorkflowAnalyticsDataProvider(
    document,
    new SimulationAnalyticsProvider(() => ({ simulationReport: null })),
    new TestingAnalyticsProvider(() => ({ runHistory, latestRun: runHistory[0] ?? null })),
    new DebuggerAnalyticsProvider(() => ({ profilerEntries: [], hotPaths: [] })),
    new TriggerAnalyticsProvider(() => ({ triggerAnalytics: null })),
  );
  const viewModel = service.buildViewModelFromProvider(provider);
  assert.ok(viewModel.dashboard);
  assert.ok(viewModel.report.exportPayload.generatedAt);
  console.log("  ✓ dependency graph flows providers → service → view model");
}

console.log("\nAll workflow builder analytics platform tests passed.\n");
