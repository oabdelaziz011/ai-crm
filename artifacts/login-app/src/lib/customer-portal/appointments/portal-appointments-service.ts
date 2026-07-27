import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateCancellationPolicy, evaluateReschedulePolicy } from "@/lib/scheduling/booking-domain/booking-policy";
import { getBookingDomainServices } from "@/lib/scheduling/booking-domain";
import type { PortalAppointmentFilter, PortalAppointmentView } from "@/lib/customer-portal/types";

/** Customer appointment management — reuses BookingDomainService. */
export class PortalAppointmentsService {
  constructor(private readonly client: SupabaseClient) {}

  private relationName(value: unknown): string {
    if (!value) return "—";
    if (Array.isArray(value)) return (value[0] as { name?: string })?.name ?? "—";
    return (value as { name?: string }).name ?? "—";
  }

  async list(
    companyId: string,
    customerId: string,
    filter: PortalAppointmentFilter,
  ): Promise<PortalAppointmentView[]> {
    let statusFilter: string[] = [];
    if (filter === "upcoming") statusFilter = ["pending", "confirmed", "checked_in"];
    else if (filter === "completed") statusFilter = ["completed"];
    else if (filter === "cancelled") statusFilter = ["cancelled", "rescheduled"];
    else if (filter === "no_show") statusFilter = ["no_show"];

    const { data, error } = await this.client
      .from("scheduling_bookings")
      .select("id, status, start_at, end_at, scheduling_services(name), scheduling_resources(name)")
      .eq("company_id", companyId)
      .eq("customer_id", customerId)
      .in("status", statusFilter)
      .is("deleted_at", null)
      .order("start_at", { ascending: filter === "upcoming" });

    if (error) throw new Error(error.message);

    const { data: rules } = await this.client
      .from("scheduling_booking_rules")
      .select("min_cancellation_notice_minutes, min_reschedule_notice_minutes")
      .eq("company_id", companyId)
      .maybeSingle();

    const now = new Date();
    const minCancel = rules?.min_cancellation_notice_minutes ?? 0;
    const minReschedule = rules?.min_reschedule_notice_minutes ?? 0;

    return (data ?? []).map((row) => {
      const cancelErr = evaluateCancellationPolicy(row.start_at, minCancel, now);
      const rescheduleErr = evaluateReschedulePolicy(row.start_at, minReschedule, now);
      const isUpcoming = ["pending", "confirmed"].includes(row.status);
      return {
        id: row.id,
        serviceName: this.relationName(row.scheduling_services),
        resourceName: this.relationName(row.scheduling_resources),
        startAt: row.start_at,
        endAt: row.end_at,
        status: row.status,
        canReschedule: !rescheduleErr && isUpcoming,
        canCancel: !cancelErr && isUpcoming,
        canCheckIn: row.status === "confirmed" && isUpcoming,
        checkInToken: null,
      };
    });
  }

  async cancel(companyId: string, bookingId: string): Promise<void> {
    const domain = getBookingDomainServices();
    await domain.bookingDomain.cancelBooking({
      companyId,
      bookingId,
      reason: "customer_request",
      notes: "Cancelled via customer portal",
      updatedBy: null,
    });
  }

  async reschedule(
    companyId: string,
    bookingId: string,
    date: string,
    slotStart: string,
  ): Promise<void> {
    const domain = getBookingDomainServices();
    await domain.bookingDomain.rescheduleBooking({
      companyId,
      bookingId,
      date,
      slotStart,
      updatedBy: null,
    });
  }
}
