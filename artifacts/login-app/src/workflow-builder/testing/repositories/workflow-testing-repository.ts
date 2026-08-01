import type { TestCase, TestSuite, TestSuiteRunRecord, TestingScope } from "../types/testing-types";
import type { TestRunStore } from "./test-run-store";

export interface WorkflowTestingRepository {
  listSuites(scope: TestingScope): TestSuite[];
  getSuite(scope: TestingScope, suiteId: string): TestSuite | null;
  saveSuite(scope: TestingScope, suite: TestSuite): TestSuite;

  listCases(scope: TestingScope, suiteId: string): TestCase[];
  getCase(scope: TestingScope, caseId: string): TestCase | null;
  saveCase(scope: TestingScope, testCase: TestCase): TestCase;

  archiveSuite(scope: TestingScope, suiteId: string): TestSuite | null;
  restoreSuite(scope: TestingScope, suiteId: string): TestSuite | null;
  archiveCase(scope: TestingScope, caseId: string): TestCase | null;
  restoreCase(scope: TestingScope, caseId: string): TestCase | null;

  listRuns(scope: TestingScope, suiteId?: string | null): TestSuiteRunRecord[];
  saveRun(scope: TestingScope, run: TestSuiteRunRecord): TestSuiteRunRecord;
  latestRun(scope: TestingScope, suiteId?: string | null): TestSuiteRunRecord | null;

  disposeScope(scope: TestingScope): void;

  readonly runStore: TestRunStore;
}
