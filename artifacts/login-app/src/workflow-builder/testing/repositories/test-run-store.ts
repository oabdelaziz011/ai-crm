import type { TestSuiteRunRecord, TestingScope } from "../types/testing-types";

export interface TestRunStore {
  addRun(scope: TestingScope, run: TestSuiteRunRecord): TestSuiteRunRecord;
  listRuns(scope: TestingScope, suiteId?: string | null): TestSuiteRunRecord[];
  latestRun(scope: TestingScope, suiteId?: string | null): TestSuiteRunRecord | null;
  clearScope(scope: TestingScope): void;
}

function scopeKey(companyId: string, flowId: string): string {
  return `${companyId}:${flowId}`;
}

const MAX_RUN_HISTORY = 50;

export class InMemoryTestRunStore implements TestRunStore {
  private readonly runsByScope = new Map<string, TestSuiteRunRecord[]>();

  addRun(scope: TestingScope, run: TestSuiteRunRecord): TestSuiteRunRecord {
    const key = scopeKey(scope.companyId, scope.flowId);
    const runs = this.runsByScope.get(key) ?? [];
    runs.unshift(run);
    if (runs.length > MAX_RUN_HISTORY) {
      runs.length = MAX_RUN_HISTORY;
    }
    this.runsByScope.set(key, runs);
    return run;
  }

  listRuns(scope: TestingScope, suiteId?: string | null): TestSuiteRunRecord[] {
    const runs = this.runsByScope.get(scopeKey(scope.companyId, scope.flowId)) ?? [];
    if (!suiteId) return [...runs];
    return runs.filter((run) => run.suiteId === suiteId);
  }

  latestRun(scope: TestingScope, suiteId?: string | null): TestSuiteRunRecord | null {
    return this.listRuns(scope, suiteId)[0] ?? null;
  }

  clearScope(scope: TestingScope): void {
    this.runsByScope.delete(scopeKey(scope.companyId, scope.flowId));
  }
}
