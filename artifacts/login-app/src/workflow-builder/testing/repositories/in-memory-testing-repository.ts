import type { TestCase, TestSuite, TestSuiteRunRecord, TestingScope } from "../types/testing-types";
import { InMemoryTestRunStore } from "./test-run-store";
import type { WorkflowTestingRepository } from "./workflow-testing-repository";

function scopeKey(companyId: string, flowId: string): string {
  return `${companyId}:${flowId}`;
}

type SuiteScopeState = {
  suites: Map<string, TestSuite>;
  cases: Map<string, TestCase>;
};

export class InMemoryTestingRepository implements WorkflowTestingRepository {
  readonly runStore = new InMemoryTestRunStore();

  private readonly scopes = new Map<string, SuiteScopeState>();

  private getScope(scope: TestingScope): SuiteScopeState {
    const key = scopeKey(scope.companyId, scope.flowId);
    let state = this.scopes.get(key);
    if (!state) {
      state = {
        suites: new Map(),
        cases: new Map(),
      };
      this.scopes.set(key, state);
    }
    return state;
  }

  listSuites(scope: TestingScope): TestSuite[] {
    return [...this.getScope(scope).suites.values()].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );
  }

  getSuite(scope: TestingScope, suiteId: string): TestSuite | null {
    return this.getScope(scope).suites.get(suiteId) ?? null;
  }

  saveSuite(scope: TestingScope, suite: TestSuite): TestSuite {
    this.getScope(scope).suites.set(suite.id, suite);
    return suite;
  }

  listCases(scope: TestingScope, suiteId: string): TestCase[] {
    return [...this.getScope(scope).cases.values()]
      .filter((testCase) => testCase.suiteId === suiteId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  getCase(scope: TestingScope, caseId: string): TestCase | null {
    return this.getScope(scope).cases.get(caseId) ?? null;
  }

  saveCase(scope: TestingScope, testCase: TestCase): TestCase {
    this.getScope(scope).cases.set(testCase.id, testCase);
    return testCase;
  }

  archiveSuite(scope: TestingScope, suiteId: string): TestSuite | null {
    const suite = this.getSuite(scope, suiteId);
    if (!suite) return null;
    return this.saveSuite(scope, {
      ...suite,
      status: "archived",
      updatedAt: new Date().toISOString(),
    });
  }

  restoreSuite(scope: TestingScope, suiteId: string): TestSuite | null {
    const suite = this.getSuite(scope, suiteId);
    if (!suite) return null;
    return this.saveSuite(scope, {
      ...suite,
      status: "active",
      updatedAt: new Date().toISOString(),
    });
  }

  archiveCase(scope: TestingScope, caseId: string): TestCase | null {
    const testCase = this.getCase(scope, caseId);
    if (!testCase) return null;
    return this.saveCase(scope, {
      ...testCase,
      status: "archived",
      updatedAt: new Date().toISOString(),
    });
  }

  restoreCase(scope: TestingScope, caseId: string): TestCase | null {
    const testCase = this.getCase(scope, caseId);
    if (!testCase) return null;
    return this.saveCase(scope, {
      ...testCase,
      status: "active",
      updatedAt: new Date().toISOString(),
    });
  }

  listRuns(scope: TestingScope, suiteId?: string | null): TestSuiteRunRecord[] {
    return this.runStore.listRuns(scope, suiteId);
  }

  saveRun(scope: TestingScope, run: TestSuiteRunRecord): TestSuiteRunRecord {
    return this.runStore.addRun(scope, run);
  }

  latestRun(scope: TestingScope, suiteId?: string | null): TestSuiteRunRecord | null {
    return this.runStore.latestRun(scope, suiteId);
  }

  disposeScope(scope: TestingScope): void {
    this.scopes.delete(scopeKey(scope.companyId, scope.flowId));
    this.runStore.clearScope(scope);
  }
}
