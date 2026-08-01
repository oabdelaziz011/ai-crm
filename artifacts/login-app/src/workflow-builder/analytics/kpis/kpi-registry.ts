import type { WorkflowDocument } from "../../core/types";
import type {
  WorkflowAnalyticsDashboard,
  WorkflowCoverageAnalytics,
  WorkflowKpiDashboard,
} from "../types/analytics-types";

export type KpiCalculationContext = {
  document: WorkflowDocument;
  dashboard: WorkflowAnalyticsDashboard;
  coverage: WorkflowCoverageAnalytics;
  partial: Partial<WorkflowKpiDashboard>;
};

export type WorkflowKpiCalculator = {
  id: keyof WorkflowKpiDashboard;
  calculate(input: KpiCalculationContext): number;
};

export type WorkflowKpiRegistry = {
  register(calculator: WorkflowKpiCalculator): void;
  calculate(input: Omit<KpiCalculationContext, "partial">): WorkflowKpiDashboard;
  list(): readonly WorkflowKpiCalculator[];
};

export function createWorkflowKpiRegistry(calculators: readonly WorkflowKpiCalculator[] = []): WorkflowKpiRegistry {
  const registry = new Map<keyof WorkflowKpiDashboard, WorkflowKpiCalculator>();
  for (const calculator of calculators) {
    registry.set(calculator.id, calculator);
  }

  return {
    register(calculator) {
      registry.set(calculator.id, calculator);
    },
    list() {
      return [...registry.values()];
    },
    calculate(input) {
      const partial: Partial<WorkflowKpiDashboard> = {};
      const context: KpiCalculationContext = { ...input, partial };

      for (const calculator of registry.values()) {
        partial[calculator.id] = calculator.calculate(context);
        context.partial = partial;
      }

      return {
        workflowQuality: partial.workflowQuality ?? 0,
        workflowComplexity: partial.workflowComplexity ?? 0,
        maintainability: partial.maintainability ?? 0,
        stability: partial.stability ?? 0,
        readiness: partial.readiness ?? 0,
      };
    },
  };
}
