import type {
  TestCase,
  TestCaseRunResult,
  TestCoverageSnapshot,
  TestReportSnapshot,
  TestSuite,
  TestSuiteRunRecord,
} from "../types/testing-types";

export type TestingSuiteViewModel = TestSuite & {
  caseCount: number;
  activeCaseCount: number;
};

export type TestingPanelViewModel = {
  suites: TestingSuiteViewModel[];
  archivedSuites: TestingSuiteViewModel[];
  selectedSuiteId: string | null;
  cases: TestCase[];
  runHistory: TestSuiteRunRecord[];
  latestRun: TestSuiteRunRecord | null;
  selectedFailure: TestCaseRunResult | null;
  isRunning: boolean;
  report: TestReportSnapshot | null;
  coverage: TestCoverageSnapshot | null;
};

export function buildTestingSuiteViewModel(suite: TestSuite, cases: readonly TestCase[]): TestingSuiteViewModel {
  const activeCaseCount = cases.filter((testCase) => testCase.status === "active").length;
  return {
    ...suite,
    caseCount: cases.length,
    activeCaseCount,
  };
}

export function buildTestingPanelViewModel(input: {
  suites: readonly TestSuite[];
  archivedSuites: readonly TestSuite[];
  cases: readonly TestCase[];
  selectedSuiteId: string | null;
  runHistory: readonly TestSuiteRunRecord[];
  latestRun: TestSuiteRunRecord | null;
  selectedFailure: TestCaseRunResult | null;
  isRunning: boolean;
}): TestingPanelViewModel {
  const report = input.latestRun?.report ?? null;
  const coverage = report?.coverage ?? null;

  return {
    suites: input.suites.map((suite) =>
      buildTestingSuiteViewModel(
        suite,
        input.cases.filter((testCase) => testCase.suiteId === suite.id),
      ),
    ),
    archivedSuites: input.archivedSuites.map((suite) =>
      buildTestingSuiteViewModel(suite, input.cases.filter((testCase) => testCase.suiteId === suite.id)),
    ),
    selectedSuiteId: input.selectedSuiteId,
    cases: input.selectedSuiteId
      ? input.cases.filter((testCase) => testCase.suiteId === input.selectedSuiteId && testCase.status === "active")
      : [],
    runHistory: [...input.runHistory],
    latestRun: input.latestRun,
    selectedFailure: input.selectedFailure,
    isRunning: input.isRunning,
    report,
    coverage,
  };
}

export function findFirstFailedCase(run: TestSuiteRunRecord | null): TestCaseRunResult | null {
  if (!run) return null;
  return run.caseResults.find((result) => result.status === "failed") ?? null;
}
