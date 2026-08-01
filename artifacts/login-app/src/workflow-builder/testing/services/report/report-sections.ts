import type { ReportSection } from "./report-section-types";

export const summarySection: ReportSection = {
  id: "summary",
  build(input) {
    const passed = input.caseResults.filter((result) => result.status === "passed").length;
    const failed = input.caseResults.filter((result) => result.status === "failed").length;
    const skipped = input.caseResults.filter((result) => result.status === "skipped").length;
    const readinessScore = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          input.coverage.nodeCoveragePercent * 0.35 +
            input.coverage.branchCoveragePercent * 0.2 +
            input.coverage.triggerCoveragePercent * 0.15 +
            input.coverage.assertionCoveragePercent * 0.3 -
            failed * 10 -
            skipped * 3,
        ),
      ),
    );

    return {
      exportFragment: { passed, failed, skipped, readinessScore },
    };
  },
};

export const coverageSection: ReportSection = {
  id: "coverage",
  build(input) {
    return {
      exportFragment: { ...input.coverage },
    };
  },
};

export const regressionSection: ReportSection = {
  id: "regression",
  build(input) {
    return {
      exportFragment: {
        cases: input.caseResults.map((result) => ({
          caseId: result.caseId,
          caseName: result.caseName,
          status: result.status,
          durationMs: result.durationMs,
        })),
      },
    };
  },
};

export const assertionsSection: ReportSection = {
  id: "assertions",
  build(input) {
    return {
      exportFragment: {
        cases: input.caseResults.map((result) => ({
          caseId: result.caseId,
          assertionResults: result.assertionResults,
        })),
      },
    };
  },
};

export const metricsSection: ReportSection = {
  id: "metrics",
  build(input) {
    const bottlenecks = input.caseResults
      .filter((result) => result.durationMs >= 250)
      .sort((left, right) => right.durationMs - left.durationMs)
      .slice(0, 5)
      .map((result) => `${result.caseName} (${result.durationMs}ms)`);

    return {
      exportFragment: { bottlenecks },
    };
  },
};

export const timelineSection: ReportSection = {
  id: "timeline",
  build(input) {
    return {
      exportFragment: {
        cases: input.caseResults.map((result) => ({
          caseId: result.caseId,
          snapshotSummary: result.snapshotSummary,
        })),
      },
    };
  },
};

export const failureSection: ReportSection = {
  id: "failures",
  build(input) {
    const warnings = [
      ...new Set(
        input.caseResults.flatMap((result) => (result.status === "failed" ? result.failures : [])),
      ),
    ];

    return {
      exportFragment: { warnings },
    };
  },
};

export const builtInReportSections: ReportSection[] = [
  summarySection,
  coverageSection,
  regressionSection,
  assertionsSection,
  metricsSection,
  timelineSection,
  failureSection,
];
