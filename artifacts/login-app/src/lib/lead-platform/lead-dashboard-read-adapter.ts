import { createLoginAppLeadReadPort, buildDashboardLeadReadAccess } from "./lead-read-port-adapter.js";

export async function fetchLeadDashboardMetrics(companyId: string) {
  const reads = createLoginAppLeadReadPort();
  return reads.fetchDashboardMetrics(buildDashboardLeadReadAccess(companyId), { companyId });
}
