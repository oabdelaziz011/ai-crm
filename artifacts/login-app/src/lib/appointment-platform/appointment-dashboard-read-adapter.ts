import { createLoginAppAppointmentReadPort, buildDashboardAppointmentReadAccess } from "./appointment-read-port-adapter.js";

export async function fetchAppointmentDashboardMetrics(companyId: string) {
  const reads = createLoginAppAppointmentReadPort();
  return reads.fetchDashboardMetrics(buildDashboardAppointmentReadAccess(companyId), { companyId });
}
