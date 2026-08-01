import { createWorkflowKpiRegistry } from "./kpi-registry";
import { builtInKpiCalculators } from "./built-in-kpis";

export const defaultWorkflowKpiRegistry = createWorkflowKpiRegistry(builtInKpiCalculators);

export function createDefaultWorkflowKpiRegistry() {
  return defaultWorkflowKpiRegistry;
}
