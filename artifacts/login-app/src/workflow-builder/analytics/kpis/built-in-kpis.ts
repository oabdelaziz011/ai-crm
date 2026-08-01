import type { WorkflowKpiCalculator } from "./kpi-registry";

export const complexityKpi: WorkflowKpiCalculator = {
  id: "workflowComplexity",
  calculate(input) {
    const nodeCount = input.document.nodes.length;
    const edgeCount = input.document.edges.length;
    return Math.min(100, Math.round(nodeCount * 4 + edgeCount * 2));
  },
};

export const maintainabilityKpi: WorkflowKpiCalculator = {
  id: "maintainability",
  calculate(input) {
    const complexity = input.partial.workflowComplexity ?? complexityKpi.calculate(input);
    return Math.max(0, Math.min(100, 100 - complexity * 0.35));
  },
};

export const stabilityKpi: WorkflowKpiCalculator = {
  id: "stability",
  calculate(input) {
    return input.dashboard.executions > 0
      ? Math.max(0, Math.min(100, 100 - input.dashboard.failedTests * 12))
      : 50;
  },
};

export const readinessKpi: WorkflowKpiCalculator = {
  id: "readiness",
  calculate(input) {
    return input.dashboard.readinessScore ?? input.coverage.nodeCoveragePercent;
  },
};

export const qualityKpi: WorkflowKpiCalculator = {
  id: "workflowQuality",
  calculate(input) {
    const maintainability = input.partial.maintainability ?? maintainabilityKpi.calculate(input);
    const stability = input.partial.stability ?? stabilityKpi.calculate(input);
    return Math.round(
      input.coverage.nodeCoveragePercent * 0.25 +
        input.coverage.assertionCoveragePercent * 0.25 +
        maintainability * 0.2 +
        stability * 0.15 +
        (input.dashboard.readinessScore ?? 50) * 0.15,
    );
  },
};

export const builtInKpiCalculators: WorkflowKpiCalculator[] = [
  complexityKpi,
  maintainabilityKpi,
  stabilityKpi,
  readinessKpi,
  qualityKpi,
];
