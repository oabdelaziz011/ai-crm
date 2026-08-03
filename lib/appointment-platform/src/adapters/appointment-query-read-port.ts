import type { AppointmentReadPort } from "../ports/appointment-read-port.js";
import type { AppointmentQueryService } from "../services/appointment-query-service.js";

export function createAppointmentReadPort(queries: AppointmentQueryService): AppointmentReadPort {
  return {
    getAppointment: (access, input) => queries.getAppointment(access, input),
    searchAppointments: (access, input) => queries.searchAppointments(access, input),
    listUpcoming: (access, input) => queries.listUpcoming(access, input),
    listPast: (access, input) => queries.listPast(access, input),
    listCancelled: (access, input) => queries.listCancelled(access, input),
    listByCustomer: (access, input) => queries.listByCustomer(access, input),
    fetchAvailability: (access, input) => queries.fetchAvailability(access, input),
    fetchDashboardMetrics: (access, input) => queries.fetchDashboardMetrics(access, input),
  };
}
