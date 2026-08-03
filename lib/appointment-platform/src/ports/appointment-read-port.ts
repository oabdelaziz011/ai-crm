import type { AppointmentMetricsSnapshot, AppointmentRecord, AppointmentServiceContext } from "../types/appointment-types.js";

export type AppointmentReadAccessContext = AppointmentServiceContext;

export interface AppointmentReadPort {
  getAppointment(
    access: AppointmentReadAccessContext,
    input: { companyId: string; appointmentId: string },
  ): Promise<{ appointment: AppointmentRecord | null }>;

  searchAppointments(
    access: AppointmentReadAccessContext,
    input: {
      companyId: string;
      customerId?: string;
      leadId?: string;
      conversationId?: string;
      resourceId?: string;
      status?: string;
      from?: string;
      to?: string;
      query?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ appointments: AppointmentRecord[]; total: number }>;

  listUpcoming(
    access: AppointmentReadAccessContext,
    input: { companyId: string; customerId?: string; leadId?: string; limit?: number },
  ): Promise<{ appointments: AppointmentRecord[] }>;

  listPast(
    access: AppointmentReadAccessContext,
    input: { companyId: string; customerId?: string; limit?: number },
  ): Promise<{ appointments: AppointmentRecord[] }>;

  listCancelled(
    access: AppointmentReadAccessContext,
    input: { companyId: string; customerId?: string; limit?: number },
  ): Promise<{ appointments: AppointmentRecord[] }>;

  listByCustomer(
    access: AppointmentReadAccessContext,
    input: { companyId: string; customerId: string; limit?: number },
  ): Promise<{ upcoming: AppointmentRecord[]; completed: AppointmentRecord[]; cancelled: AppointmentRecord[] }>;

  fetchAvailability(
    access: AppointmentReadAccessContext,
    input: {
      companyId: string;
      resourceId: string;
      serviceId: string;
      date: string;
    },
  ): Promise<{ slots: string[]; timezone: string }>;

  fetchDashboardMetrics(
    access: AppointmentReadAccessContext,
    input: { companyId: string; periodStartIso?: string },
  ): Promise<AppointmentMetricsSnapshot>;
}
