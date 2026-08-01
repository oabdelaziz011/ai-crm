import { defaultWorkflowKpiRegistry } from "../kpis/register-built-in-kpis";

export { defaultWorkflowKpiRegistry };

export function calculateWorkflowKpis(
  input: Parameters<typeof defaultWorkflowKpiRegistry.calculate>[0],
) {
  return defaultWorkflowKpiRegistry.calculate(input);
}
