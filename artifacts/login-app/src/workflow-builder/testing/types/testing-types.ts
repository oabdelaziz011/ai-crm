import type { SimulationSnapshot } from "../../simulation/types/simulation-types";

export type TestSuiteStatus = "active" | "archived";
export type TestCaseStatus = "active" | "archived";

export type TestAssertionKind =
  | "variable_equals"
  | "variable_exists"
  | "node_executed"
  | "node_skipped"
  | "branch_selected"
  | "warning_exists"
  | "error_exists"
  | "report_score";

export type TestAssertion = {
  id: string;
  kind: TestAssertionKind;
  label: string;
  variableKey?: string | null;
  expectedValue?: unknown;
  nodeId?: string | null;
  branchKey?: string | null;
  message?: string | null;
  minScore?: number | null;
};

export type TestCase = {
  id: string;
  suiteId: string;
  name: string;
  description: string;
  mockVariables: Record<string, unknown>;
  expectedPath: string[];
  expectedOutputs: Record<string, unknown>;
  expectedWarnings: string[];
  assertions: TestAssertion[];
  status: TestCaseStatus;
  createdAt: string;
  updatedAt: string;
};

export type TestSuite = {
  id: string;
  companyId: string;
  flowId: string;
  name: string;
  description: string;
  status: TestSuiteStatus;
  createdAt: string;
  updatedAt: string;
};

export type TestRunStatus = "passed" | "failed" | "skipped" | "running";

export type TestAssertionResult = {
  assertionId: string;
  kind: TestAssertionKind;
  label: string;
  passed: boolean;
  message: string;
};

export type TestCoverageSnapshot = {
  nodeCoveragePercent: number;
  branchCoveragePercent: number;
  triggerCoveragePercent: number;
  assertionCoveragePercent: number;
  executedNodeIds: string[];
  skippedNodeIds: string[];
  totalNodes: number;
  totalBranches: number;
};

export type TestCaseRunResult = {
  caseId: string;
  caseName: string;
  status: TestRunStatus;
  durationMs: number;
  assertionResults: TestAssertionResult[];
  coverage: TestCoverageSnapshot;
  failures: string[];
  snapshotSummary: {
    status: SimulationSnapshot["status"];
    currentNodeId: string | null;
    timelineLength: number;
    variableCount: number;
    readinessScore: number | null;
  };
};

export type TestSuiteRunRecord = {
  id: string;
  suiteId: string;
  suiteName: string;
  companyId: string;
  flowId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  passed: number;
  failed: number;
  skipped: number;
  caseResults: TestCaseRunResult[];
  report: TestReportSnapshot;
};

export type TestReportSnapshot = {
  passed: number;
  failed: number;
  skipped: number;
  coverage: TestCoverageSnapshot;
  warnings: string[];
  bottlenecks: string[];
  readinessScore: number;
  exportPayload: Record<string, unknown>;
};

export type TestingScope = {
  companyId: string;
  flowId: string;
};

export type MockDataPreset = "customer" | "booking" | "ticket" | "payment" | "custom";

export type MockDataBundle = {
  preset: MockDataPreset;
  label: string;
  variables: Record<string, unknown>;
};
