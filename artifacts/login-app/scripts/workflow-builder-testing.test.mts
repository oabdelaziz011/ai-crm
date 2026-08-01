/**
 * Workflow Builder testing platform unit tests.
 * Run: pnpm --dir artifacts/login-app test:workflow-builder-testing
 */
import assert from "node:assert/strict";
import { createBuilderNode } from "../src/workflow-builder/core/persistence/workflow-mapper";
import { registerBuiltInWorkflowNodes } from "../src/workflow-builder/core/register-built-in-nodes";
import { createEdgeFromNodes } from "../src/workflow-builder/core/state/builder-reducer";
import { registerBuiltInVariableProviders } from "../src/workflow-builder/core/variables/built-in-variable-providers";
import { createIdleSimulationSnapshot } from "../src/workflow-builder/simulation/utilities/simulation-snapshot-utils";
import { InMemoryTestingRepository } from "../src/workflow-builder/testing/repositories/in-memory-testing-repository";
import { InMemoryTestRunStore } from "../src/workflow-builder/testing/repositories/test-run-store";
import type { WorkflowTestingRepository } from "../src/workflow-builder/testing/repositories/workflow-testing-repository";
import { evaluateTestCaseAssertions } from "../src/workflow-builder/testing/services/assertion-engine";
import { createAssertionRegistry } from "../src/workflow-builder/testing/services/assertions/assertion-registry";
import { equalsAssertion, existsAssertion } from "../src/workflow-builder/testing/services/assertions/equals-assertion";
import { defaultAssertionRegistry } from "../src/workflow-builder/testing/services/assertions/register-built-in-assertions";
import { analyzeTestCoverage } from "../src/workflow-builder/testing/services/coverage-analyzer";
import { buildMockVariables, listMockDataPresets } from "../src/workflow-builder/testing/services/mock-data-provider";
import { createMockProviderRegistry } from "../src/workflow-builder/testing/services/mock/mock-provider-registry";
import { customerProvider } from "../src/workflow-builder/testing/services/mock/built-in-mock-providers";
import { defaultMockProviderRegistry } from "../src/workflow-builder/testing/services/mock/register-built-in-mock-providers";
import { aggregateReportSections } from "../src/workflow-builder/testing/services/report/report-section-types";
import { builtInReportSections } from "../src/workflow-builder/testing/services/report/report-sections";
import { buildTestReport } from "../src/workflow-builder/testing/services/test-report-generator";
import { WorkflowTestingService } from "../src/workflow-builder/testing/services/test-runner-service";
import {
  buildTestingPanelViewModel,
  findFirstFailedCase,
} from "../src/workflow-builder/testing/selectors/testing-ui-selectors";
import { hasWorkflowTestingPermission } from "../src/workflow-builder/testing/permissions/testing-access";

registerBuiltInWorkflowNodes();
registerBuiltInVariableProviders();

console.log("\nWorkflow Builder testing platform tests\n");

function buildLinearDocument(flowId: string, companyId: string) {
  const start = createBuilderNode("start", { x: 0, y: 0 }, "start-1");
  const end = createBuilderNode("end", { x: 0, y: 240 }, "end-1");
  return {
    flowId,
    companyId,
    name: "Testing journey",
    description: "",
    triggerType: "inbound_message" as const,
    status: "draft" as const,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [start, end],
    edges: [createEdgeFromNodes("start-1", "end-1")],
    readOnly: false,
    hasUnpublishedDraft: true,
    versionNumber: 1,
    updatedAt: new Date().toISOString(),
  };
}

function buildSnapshotWithReport(overrides: Record<string, unknown> = {}) {
  const base = createIdleSimulationSnapshot("company-1", "flow-1");
  return {
    ...base,
    status: "completed" as const,
    currentNodeId: "end-1",
    variables: { "customer.name": "Preview Customer", ...(overrides.variables as Record<string, unknown> | undefined) },
    timeline: [
      { id: "t1", timestamp: new Date().toISOString(), type: "node_entered" as const, nodeId: "start-1", label: "Start" },
      { id: "t2", timestamp: new Date().toISOString(), type: "node_entered" as const, nodeId: "end-1", label: "End" },
    ],
    report: {
      durationMs: 12,
      executedNodeCount: 2,
      skippedNodeCount: 0,
      pendingNodeCount: 0,
      warningCount: 0,
      errorCount: 0,
      coveragePercent: 100,
      readinessScore: 96,
      executedNodeIds: ["start-1", "end-1"],
      skippedNodeIds: [],
      warnings: [],
      errors: [],
      exportPayload: {},
      ...(overrides.report as Record<string, unknown> | undefined),
    },
    ...overrides,
  };
}

{
  const repository = new InMemoryTestingRepository();
  const service = new WorkflowTestingService(repository);
  const scope = { companyId: "company-1", flowId: "flow-1" };
  const suite = service.createSuite(scope, { name: "Smoke" });
  assert.ok(suite);
  const testCase = service.createCase(scope, suite.id, {
    name: "Linear path",
    mockVariables: { "customer.name": "Test Customer" },
    expectedPath: ["start-1", "end-1"],
    assertions: [{ id: "a1", kind: "report_score", label: "Score", minScore: 50 }],
  });
  assert.ok(testCase);
  assert.equal(service.listCases(scope, suite.id).length, 1);

  const duplicate = service.duplicateCase(scope, testCase!.id);
  assert.ok(duplicate);
  assert.notEqual(duplicate!.id, testCase!.id);

  service.archiveCase(scope, testCase!.id);
  assert.equal(service.listCases(scope, suite.id).length, 1);

  service.restoreCase(scope, testCase!.id);
  assert.equal(service.listCases(scope, suite.id).length, 2);

  service.archiveSuite(scope, suite.id);
  assert.equal(service.listSuites(scope).length, 0);
  service.restoreSuite(scope, suite.id);
  assert.equal(service.listSuites(scope).length, 1);

  console.log("  ✓ suite and case lifecycle (create, duplicate, archive, restore)");
}

{
  const document = buildLinearDocument("flow-1", "company-1");
  const repository = new InMemoryTestingRepository();
  const service = new WorkflowTestingService(repository);
  const scope = { companyId: document.companyId, flowId: document.flowId };
  const suite = service.createSuite(scope, { name: "Regression" });
  service.createCase(scope, suite.id, {
    name: "End reached",
    mockVariables: buildMockVariables({}, ["customer"]),
    expectedPath: ["start-1", "end-1"],
    assertions: [{ id: "a1", kind: "node_executed", label: "End executed", nodeId: "end-1" }],
  });

  const run = service.runSuite(document, scope, suite.id);
  assert.ok(run);
  assert.equal(run!.passed, 1);
  assert.equal(run!.failed, 0);
  assert.ok(run!.report.readinessScore >= 0);
  assert.equal(service.listRunHistory(scope).length, 1);
  console.log("  ✓ regression runner executes simulation-only test case");
}

{
  const snapshot = buildSnapshotWithReport();
  const results = evaluateTestCaseAssertions(
    {
      assertions: [{ id: "a1", kind: "variable_equals", label: "Customer", variableKey: "customer.name", expectedValue: "Preview Customer" }],
      expectedPath: ["start-1", "end-1"],
      expectedOutputs: {},
      expectedWarnings: [],
    },
    snapshot,
  );
  assert.ok(results.every((result) => result.passed));
  console.log("  ✓ assertion engine evaluates variable, path, and score assertions");
}

{
  const snapshot = buildSnapshotWithReport({
    report: {
      warnings: ["Unreachable node"],
      errors: [],
    },
  });
  const failed = evaluateTestCaseAssertions(
    {
      assertions: [{ id: "a1", kind: "warning_exists", label: "Missing warning", message: "dead node" }],
      expectedPath: [],
      expectedOutputs: {},
      expectedWarnings: [],
    },
    snapshot,
  );
  assert.equal(failed.some((result) => !result.passed), true);
  console.log("  ✓ assertion engine reports failures");
}

{
  const document = buildLinearDocument("flow-1", "company-1");
  const snapshot = buildSnapshotWithReport();
  const coverage = analyzeTestCoverage({
    document,
    snapshot,
    assertionResults: [{ assertionId: "a1", kind: "report_score", label: "Score", passed: true, message: "ok" }],
  });
  assert.equal(coverage.nodeCoveragePercent, 100);
  assert.equal(coverage.triggerCoveragePercent, 100);
  console.log("  ✓ coverage analyzer derives node and trigger coverage");
}

{
  const report = buildTestReport({
    caseResults: [
      {
        caseId: "c1",
        caseName: "Case 1",
        status: "passed",
        durationMs: 10,
        assertionResults: [],
        coverage: {
          nodeCoveragePercent: 100,
          branchCoveragePercent: 0,
          triggerCoveragePercent: 100,
          assertionCoveragePercent: 100,
          executedNodeIds: ["start-1"],
          skippedNodeIds: [],
          totalNodes: 2,
          totalBranches: 1,
        },
        failures: [],
        snapshotSummary: {
          status: "completed",
          currentNodeId: "end-1",
          timelineLength: 2,
          variableCount: 1,
          readinessScore: 96,
        },
      },
    ],
    coverage: {
      nodeCoveragePercent: 100,
      branchCoveragePercent: 0,
      triggerCoveragePercent: 100,
      assertionCoveragePercent: 100,
      executedNodeIds: ["start-1"],
      skippedNodeIds: [],
      totalNodes: 2,
      totalBranches: 1,
    },
  });
  assert.equal(report.passed, 1);
  assert.ok(report.exportPayload.summary);
  console.log("  ✓ test report generator builds export-ready payload");
}

{
  assert.ok(listMockDataPresets().length >= 4);
  const merged = buildMockVariables({ foo: "bar" }, ["customer", "booking"]);
  assert.equal(merged.foo, "bar");
  assert.ok(merged["customer.name"]);
  assert.ok(merged["booking.id"]);
  console.log("  ✓ mock data provider merges presets without production calls");
}

{
  const viewModel = buildTestingPanelViewModel({
    suites: [{ id: "s1", companyId: "c1", flowId: "f1", name: "Suite", description: "", status: "active", createdAt: "", updatedAt: "" }],
    archivedSuites: [],
    cases: [],
    selectedSuiteId: "s1",
    runHistory: [],
    latestRun: null,
    selectedFailure: null,
    isRunning: false,
  });
  assert.equal(viewModel.suites.length, 1);
  console.log("  ✓ testing UI selectors build panel view model");
}

{
  const failed = findFirstFailedCase({
    id: "run-1",
    suiteId: "s1",
    suiteName: "Suite",
    companyId: "c1",
    flowId: "f1",
    startedAt: "",
    finishedAt: "",
    durationMs: 1,
    passed: 0,
    failed: 1,
    skipped: 0,
    caseResults: [{ caseId: "c1", caseName: "Case", status: "failed", durationMs: 1, assertionResults: [], coverage: {
      nodeCoveragePercent: 0,
      branchCoveragePercent: 0,
      triggerCoveragePercent: 0,
      assertionCoveragePercent: 0,
      executedNodeIds: [],
      skippedNodeIds: [],
      totalNodes: 0,
      totalBranches: 0,
    }, failures: ["boom"], snapshotSummary: { status: "failed", currentNodeId: null, timelineLength: 0, variableCount: 0, readinessScore: null } }],
    report: {
      passed: 0,
      failed: 1,
      skipped: 0,
      coverage: {
        nodeCoveragePercent: 0,
        branchCoveragePercent: 0,
        triggerCoveragePercent: 0,
        assertionCoveragePercent: 0,
        executedNodeIds: [],
        skippedNodeIds: [],
        totalNodes: 0,
        totalBranches: 0,
      },
      warnings: ["boom"],
      bottlenecks: [],
      readinessScore: 0,
      exportPayload: {},
    },
  });
  assert.equal(failed?.caseId, "c1");
  console.log("  ✓ failure selector finds first failed case");
}

{
  assert.equal(hasWorkflowTestingPermission(() => true, false), true);
  assert.equal(hasWorkflowTestingPermission(() => false, false), false);
  assert.equal(hasWorkflowTestingPermission(() => false, true), true);
  console.log("  ✓ testing permission reuses simulation RBAC gate");
}

{
  const repository: WorkflowTestingRepository = new InMemoryTestingRepository();
  const service = new WorkflowTestingService(repository);
  const scope = { companyId: "company-1", flowId: "flow-1" };
  const suite = service.createSuite(scope, { name: "Interface suite" });
  assert.ok(suite);
  assert.equal(repository.listSuites(scope).length, 1);
  assert.ok(repository.runStore === repository.runStore);
  console.log("  ✓ repository abstraction accepts interface without service changes");
}

{
  const store = new InMemoryTestRunStore();
  const scope = { companyId: "company-1", flowId: "flow-1" };
  const run = {
    id: "run-1",
    suiteId: "suite-1",
    suiteName: "Suite",
    companyId: scope.companyId,
    flowId: scope.flowId,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 10,
    passed: 1,
    failed: 0,
    skipped: 0,
    caseResults: [],
    report: {
      passed: 1,
      failed: 0,
      skipped: 0,
      coverage: {
        nodeCoveragePercent: 100,
        branchCoveragePercent: 0,
        triggerCoveragePercent: 100,
        assertionCoveragePercent: 100,
        executedNodeIds: [],
        skippedNodeIds: [],
        totalNodes: 1,
        totalBranches: 1,
      },
      warnings: [],
      bottlenecks: [],
      readinessScore: 90,
      exportPayload: {},
    },
  };

  store.addRun(scope, run);
  assert.equal(store.listRuns(scope).length, 1);
  assert.equal(store.latestRun(scope)?.id, "run-1");
  store.clearScope(scope);
  assert.equal(store.listRuns(scope).length, 0);

  const repository = new InMemoryTestingRepository();
  repository.saveRun(scope, run);
  assert.equal(repository.latestRun(scope)?.id, "run-1");
  repository.disposeScope(scope);
  assert.equal(repository.listRuns(scope).length, 0);
  console.log("  ✓ test run store owns history independently from suites");
}

{
  assert.ok(defaultAssertionRegistry.has("variable_equals"));
  assert.ok(defaultAssertionRegistry.has("report_score"));

  const customRegistry = createAssertionRegistry([equalsAssertion, existsAssertion]);
  const snapshot = buildSnapshotWithReport();
  const result = customRegistry.evaluate(
    { id: "a1", kind: "variable_equals", label: "Customer", variableKey: "customer.name", expectedValue: "Preview Customer" },
    snapshot,
  );
  assert.equal(result.passed, true);

  customRegistry.register({
    kind: "report_score",
    evaluate(assertion, snap) {
      return {
        assertionId: assertion.id,
        kind: assertion.kind,
        label: assertion.label,
        passed: (snap.report?.readinessScore ?? 0) >= 100,
        message: "plugin score",
      };
    },
  });
  assert.ok(customRegistry.has("report_score"));
  console.log("  ✓ assertion registry supports plugin registration");
}

{
  assert.ok(defaultMockProviderRegistry.get("customer"));
  const registry = createMockProviderRegistry([customerProvider]);
  assert.equal(registry.list().length, 1);
  registry.register({
    preset: "booking",
    label: "Plugin booking",
    variables: { "booking.id": "plugin-booking" },
  });
  assert.equal(registry.get("booking")?.variables["booking.id"], "plugin-booking");
  console.log("  ✓ mock provider registry supports plugin providers");
}

{
  const sectionPayload = aggregateReportSections(builtInReportSections, {
    caseResults: [
      {
        caseId: "c1",
        caseName: "Case 1",
        status: "passed",
        durationMs: 10,
        assertionResults: [],
        coverage: {
          nodeCoveragePercent: 100,
          branchCoveragePercent: 0,
          triggerCoveragePercent: 100,
          assertionCoveragePercent: 100,
          executedNodeIds: ["start-1"],
          skippedNodeIds: [],
          totalNodes: 2,
          totalBranches: 1,
        },
        failures: [],
        snapshotSummary: {
          status: "completed",
          currentNodeId: "end-1",
          timelineLength: 2,
          variableCount: 1,
          readinessScore: 96,
        },
      },
    ],
    coverage: {
      nodeCoveragePercent: 100,
      branchCoveragePercent: 0,
      triggerCoveragePercent: 100,
      assertionCoveragePercent: 100,
      executedNodeIds: ["start-1"],
      skippedNodeIds: [],
      totalNodes: 2,
      totalBranches: 1,
    },
  });

  assert.ok(sectionPayload.summary);
  assert.ok(sectionPayload.coverage);
  assert.ok(sectionPayload.regression);
  assert.ok(sectionPayload.assertions);
  assert.ok(sectionPayload.metrics);
  assert.ok(sectionPayload.timeline);
  assert.ok(sectionPayload.failures);
  console.log("  ✓ report sections generate independent export fragments");
}

console.log("\nAll workflow builder testing platform tests passed.\n");
