export function buildSimulationScopeKey(companyId: string, flowId: string): string {
  return `${companyId}:${flowId}`;
}
