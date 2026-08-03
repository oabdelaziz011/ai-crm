import { APPOINTMENT_PERMISSIONS, APPOINTMENT_QUERY_CACHE_TTL, UPCOMING_APPOINTMENT_STATUSES } from "../constants.js";
import type { AppointmentQueryCachePort } from "../cache/appointment-query-cache-port.js";
import { buildAppointmentQueryCacheKey } from "../cache/appointment-query-cache-port.js";
import type { AvailabilityEnginePort } from "../ports/scheduling-engine-port.js";
import type { AppointmentRepository } from "../repositories/appointment-repository-port.js";
import type { AppointmentRecord, AppointmentServiceContext, AppointmentMetricsSnapshot } from "../types/appointment-types.js";
import { assertAppointmentCompanyAccess, assertAppointmentPermission } from "../validators/appointment-guards.js";

export type AppointmentQueryServiceDeps = {
  appointments: AppointmentRepository;
  cache: AppointmentQueryCachePort;
  availability?: AvailabilityEnginePort;
};

export class AppointmentQueryService {
  constructor(private readonly deps: AppointmentQueryServiceDeps) {}

  async getAppointment(ctx: AppointmentServiceContext, input: { companyId: string; appointmentId: string }) {
    assertAppointmentCompanyAccess(ctx, input.companyId);
    assertAppointmentPermission(ctx, APPOINTMENT_PERMISSIONS.view);
    const appointment = await this.deps.appointments.getAppointment(input.companyId, input.appointmentId);
    return { appointment };
  }

  async searchAppointments(
    ctx: AppointmentServiceContext,
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
  ) {
    assertAppointmentCompanyAccess(ctx, input.companyId);
    assertAppointmentPermission(ctx, APPOINTMENT_PERMISSIONS.view);
    return this.deps.appointments.searchAppointments({
      companyId: input.companyId,
      customerId: input.customerId,
      leadId: input.leadId,
      conversationId: input.conversationId,
      resourceId: input.resourceId,
      status: input.status as AppointmentRecord["status"] | undefined,
      from: input.from,
      to: input.to,
      query: input.query,
      limit: input.limit ?? 25,
      offset: input.offset ?? 0,
    });
  }

  async listUpcoming(
    ctx: AppointmentServiceContext,
    input: { companyId: string; customerId?: string; leadId?: string; limit?: number },
  ) {
    assertAppointmentCompanyAccess(ctx, input.companyId);
    assertAppointmentPermission(ctx, APPOINTMENT_PERMISSIONS.view);
    const now = new Date().toISOString();
    const { appointments } = await this.deps.appointments.searchAppointments({
      companyId: input.companyId,
      customerId: input.customerId,
      leadId: input.leadId,
      from: now,
      limit: input.limit ?? 25,
      offset: 0,
    });
    return {
      appointments: appointments.filter((a) =>
        UPCOMING_APPOINTMENT_STATUSES.includes(a.status as (typeof UPCOMING_APPOINTMENT_STATUSES)[number]),
      ),
    };
  }

  async listPast(ctx: AppointmentServiceContext, input: { companyId: string; customerId?: string; limit?: number }) {
    assertAppointmentCompanyAccess(ctx, input.companyId);
    assertAppointmentPermission(ctx, APPOINTMENT_PERMISSIONS.view);
    const now = new Date().toISOString();
    const { appointments } = await this.deps.appointments.searchAppointments({
      companyId: input.companyId,
      customerId: input.customerId,
      to: now,
      limit: input.limit ?? 25,
      offset: 0,
    });
    return {
      appointments: appointments.filter((a) => a.status === "completed" || new Date(a.startAt) < new Date(now)),
    };
  }

  async listCancelled(ctx: AppointmentServiceContext, input: { companyId: string; customerId?: string; limit?: number }) {
    assertAppointmentCompanyAccess(ctx, input.companyId);
    assertAppointmentPermission(ctx, APPOINTMENT_PERMISSIONS.view);
    const { appointments } = await this.deps.appointments.searchAppointments({
      companyId: input.companyId,
      customerId: input.customerId,
      status: "cancelled",
      limit: input.limit ?? 25,
      offset: 0,
    });
    return { appointments };
  }

  async listByCustomer(
    ctx: AppointmentServiceContext,
    input: { companyId: string; customerId: string; limit?: number },
  ) {
    assertAppointmentCompanyAccess(ctx, input.companyId);
    assertAppointmentPermission(ctx, APPOINTMENT_PERMISSIONS.view);

    const now = new Date();
    const { appointments } = await this.deps.appointments.searchAppointments({
      companyId: input.companyId,
      customerId: input.customerId,
      limit: input.limit ?? 50,
      offset: 0,
    });

    const upcoming: AppointmentRecord[] = [];
    const completed: AppointmentRecord[] = [];
    const cancelled: AppointmentRecord[] = [];

    for (const appointment of appointments) {
      const status = appointment.status.toLowerCase();
      if (status === "cancelled") {
        cancelled.push(appointment);
      } else if (status === "completed") {
        completed.push(appointment);
      } else if (new Date(appointment.startAt) >= now) {
        upcoming.push(appointment);
      } else if (status === "no_show") {
        cancelled.push(appointment);
      } else {
        completed.push(appointment);
      }
    }

    return { upcoming, completed, cancelled };
  }

  async fetchAvailability(
    ctx: AppointmentServiceContext,
    input: { companyId: string; resourceId: string; serviceId: string; date: string },
  ) {
    assertAppointmentCompanyAccess(ctx, input.companyId);
    assertAppointmentPermission(ctx, APPOINTMENT_PERMISSIONS.view);
    if (!this.deps.availability) {
      return { slots: [], timezone: "UTC" };
    }
    const result = await this.deps.availability.getAvailableSlots(
      input.companyId,
      input.resourceId,
      input.serviceId,
      input.date,
    );
    return { slots: result.slots, timezone: result.timezone };
  }

  async fetchDashboardMetrics(
    ctx: AppointmentServiceContext,
    input: { companyId: string; periodStartIso?: string },
  ) {
    assertAppointmentCompanyAccess(ctx, input.companyId);
    assertAppointmentPermission(ctx, APPOINTMENT_PERMISSIONS.view);

    const cacheKey = buildAppointmentQueryCacheKey("metrics", {
      companyId: input.companyId,
      periodStartIso: input.periodStartIso ?? null,
    });
    const cached = this.deps.cache.get<AppointmentMetricsSnapshot>(cacheKey);
    if (cached) return cached;

    const metrics = await this.deps.appointments.fetchMetrics(input.companyId, input.periodStartIso);
    this.deps.cache.set(cacheKey, metrics, APPOINTMENT_QUERY_CACHE_TTL.metrics);
    return metrics;
  }
}
