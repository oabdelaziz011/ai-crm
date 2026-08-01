import type { TestCaseRunResult, TestCoverageSnapshot } from "../../types/testing-types";

export type ReportSectionInput = {
  caseResults: readonly TestCaseRunResult[];
  coverage: TestCoverageSnapshot;
};

export type ReportSectionResult = {
  exportFragment: Record<string, unknown>;
};

export type ReportSection = {
  id: string;
  build(input: ReportSectionInput): ReportSectionResult;
};

export function aggregateReportSections(
  sections: readonly ReportSection[],
  input: ReportSectionInput,
): Record<string, unknown> {
  return sections.reduce<Record<string, unknown>>((payload, section) => {
    const result = section.build(input);
    payload[section.id] = result.exportFragment;
    return payload;
  }, {});
}
