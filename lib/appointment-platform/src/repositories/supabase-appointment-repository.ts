import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mapSchedulingBookingToAppointment,
  type AppointmentMetricsSnapshot,
  type AppointmentRecord,
  type AppointmentSearchFilters,
  type SchedulingBookingRow,
} from "../types/appointment-types.js";
import type { AppointmentRepository } from "./appointment-repository-port.js";

export function createSupabaseAppointmentRepository(client: SupabaseClient): AppointmentRepository {
  return {
    mapRow(row) {
      return mapSchedulingBookingToAppointment(row);
    },

    async getAppointment(companyId, appointmentId) {
      const { data, error } = await client
        .from("scheduling_bookings")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", appointmentId)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return data ? mapSchedulingBookingToAppointment(data as SchedulingBookingRow) : null;
    },

    async searchAppointments(filters) {
      let query = client
        .from("scheduling_bookings")
        .select("*", { count: "exact" })
        .eq("company_id", filters.companyId)
        .is("deleted_at", null);

      if (filters.customerId) query = query.eq("customer_id", filters.customerId);
      if (filters.leadId) query = query.eq("lead_id", filters.leadId);
      if (filters.conversationId) query = query.eq("conversation_id", filters.conversationId);
      if (filters.resourceId) query = query.eq("resource_id", filters.resourceId);
      if (filters.status) query = query.eq("status", filters.status);
      if (filters.from) query = query.gte("start_at", filters.from);
      if (filters.to) query = query.lte("start_at", filters.to);

      query = query
        .order("start_at", { ascending: false })
        .range(filters.offset ?? 0, (filters.offset ?? 0) + (filters.limit ?? 25) - 1);

      const { data, error, count } = await query;
      if (error) throw new Error(error.message);

      return {
        appointments: (data ?? []).map((row) => mapSchedulingBookingToAppointment(row as SchedulingBookingRow)),
        total: count ?? 0,
      };
    },

    async linkIdentity(input) {
      const payload: Record<string, unknown> = { updated_by: input.updatedBy ?? null };
      if (input.leadId !== undefined) payload.lead_id = input.leadId;
      if (input.conversationId !== undefined) payload.conversation_id = input.conversationId;

      const { data, error } = await client
        .from("scheduling_bookings")
        .update(payload)
        .eq("company_id", input.companyId)
        .eq("id", input.appointmentId)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error) throw new Error(error.message);
      return mapSchedulingBookingToAppointment(data as SchedulingBookingRow);
    },

    async updateFields(input) {
      const payload: Record<string, unknown> = { updated_by: input.updatedBy ?? null };
      if (input.notes !== undefined) payload.notes = input.notes;
      if (input.resourceId) payload.resource_id = input.resourceId;

      const { data, error } = await client
        .from("scheduling_bookings")
        .update(payload)
        .eq("company_id", input.companyId)
        .eq("id", input.appointmentId)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error) throw new Error(error.message);
      return mapSchedulingBookingToAppointment(data as SchedulingBookingRow);
    },

    async confirmAppointment(companyId, appointmentId, updatedBy) {
      const { data, error } = await client
        .from("scheduling_bookings")
        .update({ status: "confirmed", updated_by: updatedBy })
        .eq("company_id", companyId)
        .eq("id", appointmentId)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error) throw new Error(error.message);
      return mapSchedulingBookingToAppointment(data as SchedulingBookingRow);
    },

    async fetchMetrics(companyId, periodStartIso) {
      const { data, error } = await client.rpc("appointment_platform_company_metrics_v1", {
        p_company_id: companyId,
        p_period_start: periodStartIso ?? new Date(new Date().setDate(1)).toISOString(),
      });

      if (error) throw new Error(error.message);

      const metrics = (data ?? {}) as Record<string, number>;
      return {
        upcoming: metrics.upcoming ?? 0,
        completedInPeriod: metrics.completedInPeriod ?? 0,
        cancelledInPeriod: metrics.cancelledInPeriod ?? 0,
        noShowInPeriod: metrics.noShowInPeriod ?? 0,
        createdInPeriod: metrics.createdInPeriod ?? 0,
        createdPreviousPeriod: metrics.createdPreviousPeriod ?? 0,
        averageDurationMinutes: metrics.averageDurationMinutes ?? 0,
        resourceUtilizationPercent: metrics.resourceUtilizationPercent ?? 0,
      } satisfies AppointmentMetricsSnapshot;
    },
  };
}
