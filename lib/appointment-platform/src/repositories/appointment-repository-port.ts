import type {
  AppointmentMetricsSnapshot,
  AppointmentRecord,
  AppointmentSearchFilters,
  SchedulingBookingRow,
} from "../types/appointment-types.js";

export interface AppointmentRepository {
  getAppointment(companyId: string, appointmentId: string): Promise<AppointmentRecord | null>;
  searchAppointments(filters: AppointmentSearchFilters): Promise<{ appointments: AppointmentRecord[]; total: number }>;
  linkIdentity(input: {
    companyId: string;
    appointmentId: string;
    leadId?: string | null;
    conversationId?: string | null;
    updatedBy?: string | null;
  }): Promise<AppointmentRecord>;
  updateFields(input: {
    companyId: string;
    appointmentId: string;
    notes?: string | null;
    resourceId?: string;
    updatedBy?: string | null;
  }): Promise<AppointmentRecord>;
  confirmAppointment(companyId: string, appointmentId: string, updatedBy: string | null): Promise<AppointmentRecord>;
  fetchMetrics(companyId: string, periodStartIso?: string): Promise<AppointmentMetricsSnapshot>;
  mapRow(row: SchedulingBookingRow): AppointmentRecord;
}
