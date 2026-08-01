/**
 * Workflow Builder optimization platform unit tests.
 * Run: pnpm --dir artifacts/login-app test:workflow-builder-optimization
 */
import assert from "node:assert/strict";
import { createBuilderNode } from "../src/workflow-builder/core/persistence/workflow-mapper";
import { registerBuiltInWorkflowNodes } from "../src/workflow-builder/core/register-built-in-nodes";
import { createEdgeFromNodes } from "../src/workflow-builder/core/state/builder-reducer";
import { createEmptyAnalyticsViewModel } from "../src/workflow-builder/analytics/utilities/empty-analytics-view-model";
import { workflowOptimizationKey } from "../src/workflow-builder/optimization/cache/optimization-query-keys";
import { hasWorkflowOptimizationPermission } from "../src/workflow-builder/optimization/permissions/workflow-optimization-access";
import {
  AnalyticsOptimizationProvider,
  CompositeWorkflowOptimizationDataProvider,
  ValidationOptimizationProvider,
  createWorkflowOptimizationDataProvider,
} from "../src/workflow-builder/optimization/providers/workflow-optimization-data-providers";
import { createOptimizationRuleRegistry } from "../src/workflow-builder/optimization/rules/optimization-rule-registry";
import {
  aiCostOptimizationRule,
  builtInOptimizationRules,
  performanceOptimizationRule,
  reliabilityOptimizationRule,
  structureOptimizationRule,
} from "../src/workflow-builder/optimization/rules/built-in-optimization-rules";
import { defaultOptimizationRuleRegistry } from "../src/workflow-builder/optimization/rules/register-built-in-optimization-rules";
import {
  analyzeAiCostRecommendations,
  analyzeComplexity,
  analyzePerformanceRecommendations,
  analyzeReliabilityRecommendations,
  analyzeStructureRecommendations,
} from "../src/workflow-builder/optimization/services/built-in-optimizers";
import {
  WorkflowOptimizationService,
  buildWorkflowOptimizationViewModel,
  buildWorkflowOptimizationViewModelFromProvider,
} from "../src/workflow-builder/optimization/services/optimization-service";
import { calculateOptimizationScore, buildOptimizationDashboard } from "../src/workflow-builder/optimization/services/optimization-score-calculator";
import { prioritizeRecommendations, estimateTotalImpact } from "../src/workflow-builder/optimization/services/recommendation-prioritizer";
import {
  createWorkflowOptimizationReportRegistry,
  executiveSummarySection,
  risksSection,
} from "../src/workflow-builder/optimization/services/report/optimization-report-registry";
import { groupRecommendationsByCategory } from "../src/workflow-builder/optimization/selectors/optimization-ui-selectors";
import { createEmptyOptimizationViewModel } from "../src/workflow-builder/optimization/utilities/empty-optimization-view-model";
import type { WorkflowOptimizationInput } from "../src/workflow-builder/optimization/types/optimization-types";

registerBuiltInWorkflowNodes();

console.log("\nWorkflow Builder optimization platform tests\n");

function buildDocument() {
  const start = createBuilderNode("start", { x: 0, y: 0 }, "start-1");
  const branch = createBuilderNode("if_else", { x: 0, y: 120 }, "cond-1");
  const aiNode = createBuilderNode("ai_decision", { x: 0, y: 200 }, "ai-1");
  const end = createBuilderNode("end", { x: 0, y: 280 }, "end-1");
  return {
    flowId: "flow-1",
    companyId: "company-1",
    name: "Optimization flow",
    description: "",
    triggerType: "inbound_message" as const,
    status: "draft" as const,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [start, branch, aiNode, end],
    edges: [
      createEdgeFromNodes("start-1", "cond-1"),
      { ...createEdgeFromNodes("cond-1", "ai-1"), branchKey: "yes" as const, branchLabel: "Yes" },
      createEdgeFromNodes("ai-1", "end-1"),
    ],
    readOnly: false,
    hasUnpublishedDraft: true,
    versionNumber: 1,
    updatedAt: new Date().toISOString(),
  };
}

const document = buildDocument();

function buildInput(overrides: Partial<WorkflowOptimizationInput> = {}): WorkflowOptimizationInput {
  const analytics = createEmptyAnalyticsViewModel();
  analytics.heatmap = [
    {
      nodeId: "ai-1",
      label: "AI Decision",
      intensity: "hot",
      executionCount: 12,
      isBottleneck: true,
    },
  ];
  analytics.branches.neverExecutedBranches = ["No"];
  analytics.kpis.stability = 55;
  analytics.dashboard.failedTests = 2;

  return {
    document,
    analytics,
    validationIssues: [
      {
        id: "unreachable-end",
        nodeId: "end-1",
        message: "This step is unreachable.",
        severity: "warning",
        kind: "unreachable",
        affectedNodeIds: ["end-1"],
      },
    ],
    ...overrides,
  };
}

assert.equal(hasWorkflowOptimizationPermission(() => true, false), true);
assert.equal(hasWorkflowOptimizationPermission(() => false, true), true);
assert.equal(hasWorkflowOptimizationPermission(() => false, false), false);

assert.deepEqual(workflowOptimizationKey("c1", "f1"), ["workflow-builder", "optimization", "c1", "f1"]);

const empty = createEmptyOptimizationViewModel();
assert.equal(empty.dashboard.optimizationScore, 100);
assert.equal(empty.recommendations.length, 0);

const input = buildInput();
const perfRecs = analyzePerformanceRecommendations(input);
assert.ok(perfRecs.some((item) => item.category === "performance"));

const structureRecs = analyzeStructureRecommendations(input);
assert.ok(structureRecs.some((item) => item.category === "structure"));

const aiRecs = analyzeAiCostRecommendations(input);
assert.ok(aiRecs.length >= 0);

const reliabilityRecs = analyzeReliabilityRecommendations(input);
assert.ok(reliabilityRecs.some((item) => item.category === "reliability"));

const complexity = analyzeComplexity(input);
assert.ok(complexity.nodeCount === 4);
assert.ok(complexity.edgeCount === 3);

const registry = createOptimizationRuleRegistry([performanceOptimizationRule, structureOptimizationRule]);
const registryRecs = registry.evaluateAll(input);
assert.ok(registryRecs.length > 0);

assert.equal(defaultOptimizationRuleRegistry.list().length, builtInOptimizationRules.length);

const prioritized = prioritizeRecommendations(registryRecs);
assert.ok(prioritized[0]!.impact >= 0);

const score = calculateOptimizationScore(prioritized);
assert.ok(score >= 0 && score <= 100);

const dashboard = buildOptimizationDashboard(prioritized);
assert.ok(dashboard.recommendationCount > 0);
assert.ok(estimateTotalImpact(prioritized) >= 0);

const viewModel = buildWorkflowOptimizationViewModel(input);
assert.ok(viewModel.dashboard.optimizationScore <= 100);
assert.ok(viewModel.recommendations.length > 0);
assert.ok(viewModel.report.executiveSummary.length > 0);
assert.ok(viewModel.complexity.nodeCount === 4);

const provider = createWorkflowOptimizationDataProvider({
  document,
  readAnalytics: () => ({ analytics: input.analytics }),
  readValidation: () => ({ validationIssues: input.validationIssues }),
});
assert.equal(provider.read().document.flowId, "flow-1");

const providerViewModel = buildWorkflowOptimizationViewModelFromProvider(provider);
assert.ok(providerViewModel.recommendations.length > 0);

const composite = new CompositeWorkflowOptimizationDataProvider(
  { document },
  new AnalyticsOptimizationProvider(() => ({ analytics: input.analytics })),
  new ValidationOptimizationProvider(() => ({ validationIssues: input.validationIssues })),
);
assert.ok(composite.read().validationIssues.length === 1);

const service = new WorkflowOptimizationService(defaultOptimizationRuleRegistry);
const serviceViewModel = service.buildViewModel(input);
assert.ok(serviceViewModel.report.risks.length >= 0);

const reportRegistry = createWorkflowOptimizationReportRegistry([executiveSummarySection, risksSection]);
const partialViewModel = buildWorkflowOptimizationViewModel(input);
const report = reportRegistry.buildReport(partialViewModel);
assert.ok(typeof report.executiveSummary === "string");
assert.ok(Array.isArray(report.risks));

const grouped = groupRecommendationsByCategory(viewModel.recommendations);
assert.ok(Array.isArray(grouped.performance));
assert.ok(Array.isArray(grouped.structure));

assert.ok(aiCostOptimizationRule.id === "ai-cost");
assert.ok(reliabilityOptimizationRule.evaluate(input).length > 0);

console.log("All optimization platform tests passed.\n");
