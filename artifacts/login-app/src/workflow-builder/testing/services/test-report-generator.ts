import type {
  TestCaseRunResult,
  TestCoverageSnapshot,
  TestReportSnapshot,
  TestSuiteRunRecord,
} from "../types/testing-types";
import { aggregateReportSections } from "./report/report-section-types";
import { builtInReportSections } from "./report/report-sections";

export function buildTestReport(input: {
  caseResults: readonly TestCaseRunResult[];
  coverage: TestCoverageSnapshot;
}): TestReportSnapshot {
  const sectionPayload = aggregateReportSections(builtInReportSections, input);
  const summary = sectionPayload.summary as {
    passed: number;
    failed: number;
    skipped: number;
    readinessScore: number;
  };
  const failures = sectionPayload.failures as { warnings: string[] };
  const metrics = sectionPayload.metrics as { bottlenecks: string[] };
  const coverage = sectionPayload.coverage as TestCoverageSnapshot;
  const regression = sectionPayload.regression as {
    cases: Array<{ caseId: string; caseName: string; status: string; durationMs: number }>;
  };
  const assertions = sectionPayload.assertions as {
    cases: Array<{ caseId: string; assertionResults: TestCaseRunResult["assertionResults"] }>;
  };

  return {
    passed: summary.passed,
    failed: summary.failed,
    skipped: summary.skipped,
    coverage,
    warnings: failures.warnings,
    bottlenecks: metrics.bottlenecks,
    readinessScore: summary.readinessScore,
    exportPayload: {
      generatedAt: new Date().toISOString(),
      summary,
      coverage,
      warnings: failures.warnings,
      bottlenecks: metrics.bottlenecks,
      regression: regression.cases,
      assertions: assertions.cases,
      cases: input.caseResults.map((result) => ({
        caseId: result.caseId,
        caseName: result.caseName,
        status: result.status,
        durationMs: result.durationMs,
        failures: result.failures,
        coverage: result.coverage,
        assertionResults: result.assertionResults,
      })),
      sections: sectionPayload,
    },
  };
}

export function summarizeSuiteRun(run: TestSuiteRunRecord): TestReportSnapshot {
  return run.report;
}
