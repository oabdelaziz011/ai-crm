import type { SimulationReport } from "../../simulation/types/simulation-types";
import type { TestSuiteRunRecord } from "../../testing/types/testing-types";
import type { WorkflowCoverageAnalytics } from "../types/analytics-types";

export function analyzeCoverageAnalytics(input: {
  latestRun: TestSuiteRunRecord | null;
  simulationReport: SimulationReport | null;
}): WorkflowCoverageAnalytics {
  const fromTesting = input.latestRun?.report.coverage;
  const fromSimulation = input.simulationReport;

  return {
    nodeCoveragePercent: fromTesting?.nodeCoveragePercent ?? fromSimulation?.coveragePercent ?? 0,
    branchCoveragePercent: fromTesting?.branchCoveragePercent ?? 0,
    assertionCoveragePercent: fromTesting?.assertionCoveragePercent ?? 0,
    triggerCoveragePercent: fromTesting?.triggerCoveragePercent ?? 0,
  };
}
