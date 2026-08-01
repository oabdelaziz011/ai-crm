import type { WorkflowDocument } from "../../core/types";
import { SimulationSessionRepository } from "../../simulation/repositories/simulation-session-repository";
import { SimulationService } from "../../simulation/services/simulation-service";
import type { SimulationSnapshot } from "../../simulation/types/simulation-types";
import type { WorkflowTestingRepository } from "../repositories/workflow-testing-repository";
import type {
  TestAssertion,
  TestCase,
  TestCaseRunResult,
  TestRunStatus,
  TestSuite,
  TestSuiteRunRecord,
  TestingScope,
} from "../types/testing-types";
import { createTestingId } from "../utilities/testing-id";
import { evaluateTestCaseAssertions } from "./assertion-engine";
import { analyzeTestCoverage, mergeCoverageSnapshots } from "./coverage-analyzer";
import { mergeTestCaseMockVariables } from "./mock-data-provider";
import { buildTestReport } from "./test-report-generator";

const MAX_INPUT_RESUME_ATTEMPTS = 24;

export class WorkflowTestingService {
  private readonly simulationService = new SimulationService(new SimulationSessionRepository());

  constructor(private readonly repository: WorkflowTestingRepository) {}

  disposeScope(scope: TestingScope): void {
    this.simulationService.disposeScope(scope.companyId, scope.flowId);
    this.repository.disposeScope(scope);
  }

  listSuites(scope: TestingScope): TestSuite[] {
    return this.repository.listSuites(scope).filter((suite) => suite.status === "active");
  }

  listArchivedSuites(scope: TestingScope): TestSuite[] {
    return this.repository.listSuites(scope).filter((suite) => suite.status === "archived");
  }

  getCase(scope: TestingScope, caseId: string): TestCase | null {
    return this.repository.getCase(scope, caseId);
  }

  createSuite(scope: TestingScope, input: { name: string; description?: string }): TestSuite {
    const now = new Date().toISOString();
    const suite: TestSuite = {
      id: createTestingId("suite"),
      companyId: scope.companyId,
      flowId: scope.flowId,
      name: input.name.trim() || "Untitled suite",
      description: input.description?.trim() ?? "",
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    return this.repository.saveSuite(scope, suite);
  }

  updateSuite(
    scope: TestingScope,
    suiteId: string,
    input: { name?: string; description?: string },
  ): TestSuite | null {
    const suite = this.repository.getSuite(scope, suiteId);
    if (!suite) return null;
    const updated: TestSuite = {
      ...suite,
      name: input.name?.trim() || suite.name,
      description: input.description?.trim() ?? suite.description,
      updatedAt: new Date().toISOString(),
    };
    return this.repository.saveSuite(scope, updated);
  }

  duplicateSuite(scope: TestingScope, suiteId: string): TestSuite | null {
    const suite = this.repository.getSuite(scope, suiteId);
    if (!suite) return null;
    const now = new Date().toISOString();
    const duplicate = this.createSuite(scope, {
      name: `${suite.name} (copy)`,
      description: suite.description,
    });
    for (const testCase of this.repository.listCases(scope, suiteId)) {
      this.createCase(scope, duplicate.id, {
        name: testCase.name,
        description: testCase.description,
        mockVariables: { ...testCase.mockVariables },
        expectedPath: [...testCase.expectedPath],
        expectedOutputs: { ...testCase.expectedOutputs },
        expectedWarnings: [...testCase.expectedWarnings],
        assertions: testCase.assertions.map((assertion) => ({ ...assertion, id: createTestingId("assertion") })),
      });
    }
    duplicate.updatedAt = now;
    return this.repository.saveSuite(scope, duplicate);
  }

  archiveSuite(scope: TestingScope, suiteId: string): TestSuite | null {
    return this.repository.archiveSuite(scope, suiteId);
  }

  restoreSuite(scope: TestingScope, suiteId: string): TestSuite | null {
    return this.repository.restoreSuite(scope, suiteId);
  }

  listCases(scope: TestingScope, suiteId: string): TestCase[] {
    return this.repository.listCases(scope, suiteId).filter((testCase) => testCase.status === "active");
  }

  listAllCases(scope: TestingScope, suiteId: string): TestCase[] {
    return this.repository.listCases(scope, suiteId);
  }

  createCase(
    scope: TestingScope,
    suiteId: string,
    input: {
      name: string;
      description?: string;
      mockVariables?: Record<string, unknown>;
      expectedPath?: string[];
      expectedOutputs?: Record<string, unknown>;
      expectedWarnings?: string[];
      assertions?: TestAssertion[];
    },
  ): TestCase | null {
    const suite = this.repository.getSuite(scope, suiteId);
    if (!suite || suite.status === "archived") return null;
    const now = new Date().toISOString();
    const testCase: TestCase = {
      id: createTestingId("case"),
      suiteId,
      name: input.name.trim() || "Untitled test",
      description: input.description?.trim() ?? "",
      mockVariables: input.mockVariables ?? {},
      expectedPath: input.expectedPath ?? [],
      expectedOutputs: input.expectedOutputs ?? {},
      expectedWarnings: input.expectedWarnings ?? [],
      assertions: input.assertions ?? [],
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    this.repository.saveCase(scope, testCase);
    this.repository.saveSuite(scope, { ...suite, updatedAt: now });
    return testCase;
  }

  updateCase(
    scope: TestingScope,
    caseId: string,
    input: Partial<
      Pick<
        TestCase,
        | "name"
        | "description"
        | "mockVariables"
        | "expectedPath"
        | "expectedOutputs"
        | "expectedWarnings"
        | "assertions"
      >
    >,
  ): TestCase | null {
    const testCase = this.repository.getCase(scope, caseId);
    if (!testCase) return null;
    const updated: TestCase = {
      ...testCase,
      ...input,
      name: input.name?.trim() || testCase.name,
      description: input.description?.trim() ?? testCase.description,
      updatedAt: new Date().toISOString(),
    };
    return this.repository.saveCase(scope, updated);
  }

  duplicateCase(scope: TestingScope, caseId: string): TestCase | null {
    const testCase = this.repository.getCase(scope, caseId);
    if (!testCase) return null;
    return this.createCase(scope, testCase.suiteId, {
      name: `${testCase.name} (copy)`,
      description: testCase.description,
      mockVariables: { ...testCase.mockVariables },
      expectedPath: [...testCase.expectedPath],
      expectedOutputs: { ...testCase.expectedOutputs },
      expectedWarnings: [...testCase.expectedWarnings],
      assertions: testCase.assertions.map((assertion) => ({ ...assertion, id: createTestingId("assertion") })),
    });
  }

  archiveCase(scope: TestingScope, caseId: string): TestCase | null {
    return this.repository.archiveCase(scope, caseId);
  }

  restoreCase(scope: TestingScope, caseId: string): TestCase | null {
    return this.repository.restoreCase(scope, caseId);
  }

  listRunHistory(scope: TestingScope, suiteId?: string | null): TestSuiteRunRecord[] {
    return this.repository.listRuns(scope, suiteId);
  }

  latestRun(scope: TestingScope, suiteId?: string | null): TestSuiteRunRecord | null {
    return this.repository.latestRun(scope, suiteId);
  }

  runCase(document: WorkflowDocument, testCase: TestCase): TestCaseRunResult {
    const startedAt = Date.now();
    if (testCase.status === "archived") {
      return this.buildSkippedResult(testCase, startedAt, "Test case is archived.");
    }

    const snapshot = this.runSimulation(document, mergeTestCaseMockVariables(testCase));
    const assertionResults = evaluateTestCaseAssertions(testCase, snapshot);
    const coverage = analyzeTestCoverage({ document, snapshot, assertionResults });
    const failures = assertionResults.filter((result) => !result.passed).map((result) => result.message);
    const status = this.resolveCaseStatus(snapshot, assertionResults);

    return {
      caseId: testCase.id,
      caseName: testCase.name,
      status,
      durationMs: Date.now() - startedAt,
      assertionResults,
      coverage,
      failures,
      snapshotSummary: {
        status: snapshot.status,
        currentNodeId: snapshot.currentNodeId,
        timelineLength: snapshot.timeline.length,
        variableCount: Object.keys(snapshot.variables).length,
        readinessScore: snapshot.report?.readinessScore ?? null,
      },
    };
  }

  runSuite(document: WorkflowDocument, scope: TestingScope, suiteId: string): TestSuiteRunRecord | null {
    const suite = this.repository.getSuite(scope, suiteId);
    if (!suite) return null;

    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    const activeCases = this.repository.listCases(scope, suiteId).filter((testCase) => testCase.status === "active");
    const caseResults: TestCaseRunResult[] = [];

    for (const testCase of activeCases) {
      caseResults.push(this.runCase(document, testCase));
    }

    const coverage = mergeCoverageSnapshots(caseResults.map((result) => result.coverage));
    const report = buildTestReport({ caseResults, coverage });
    const run: TestSuiteRunRecord = {
      id: createTestingId("run"),
      suiteId: suite.id,
      suiteName: suite.name,
      companyId: scope.companyId,
      flowId: scope.flowId,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      passed: report.passed,
      failed: report.failed,
      skipped: report.skipped,
      caseResults,
      report,
    };

    return this.repository.saveRun(scope, run);
  }

  private runSimulation(
    document: WorkflowDocument,
    initialVariables: Record<string, unknown>,
  ): Readonly<SimulationSnapshot> {
    const { companyId, flowId } = document;
    this.simulationService.disposeScope(companyId, flowId);

    let snapshot = this.simulationService.start(document, {
      initialVariables,
      autoAdvance: true,
    });

    let attempts = 0;
    while (snapshot.status === "waiting_input" && attempts < MAX_INPUT_RESUME_ATTEMPTS) {
      snapshot = this.simulationService.resume(companyId, flowId);
      attempts += 1;
    }

    this.simulationService.disposeScope(companyId, flowId);
    return snapshot;
  }

  private resolveCaseStatus(
    snapshot: Readonly<SimulationSnapshot>,
    assertionResults: ReturnType<typeof evaluateTestCaseAssertions>,
  ): TestRunStatus {
    if (snapshot.status === "waiting_input") return "skipped";
    if (snapshot.status === "failed") return "failed";
    return assertionResults.every((result) => result.passed) ? "passed" : "failed";
  }

  private buildSkippedResult(testCase: TestCase, startedAt: number, reason: string): TestCaseRunResult {
    return {
      caseId: testCase.id,
      caseName: testCase.name,
      status: "skipped",
      durationMs: Date.now() - startedAt,
      assertionResults: [],
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
      failures: [reason],
      snapshotSummary: {
        status: "idle",
        currentNodeId: null,
        timelineLength: 0,
        variableCount: 0,
        readinessScore: null,
      },
    };
  }
}
