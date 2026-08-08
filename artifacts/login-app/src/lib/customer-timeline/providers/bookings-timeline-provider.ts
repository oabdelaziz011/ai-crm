import { supabase } from "@/lib/supabase";
import type { TimelineEvent, TimelineEventProvider, TimelineFetchInput } from "../types";
import { truncateText } from "../provider-utils";

type SchedulingBookingRow = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  source: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  scheduling_services?: { name: string } | { name: string }[] | null;
};

type LegacyBookingRow = {
  id: string;
  service: string;
  booking_date: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export class BookingsTimelineProvider implements TimelineEventProvider {
  readonly providerId = "bookings";

  async getEvents({ customerId, companyId }: TimelineFetchInput): Promise<TimelineEvent[]> {
    const events: TimelineEvent[] = [];

    if (companyId) {
      const { data, error } = await supabase
        .from("scheduling_bookings")
        .select(
          "id, start_at, end_at, status, source, notes, created_at, updated_at, scheduling_services(name)",
        )
        .eq("company_id", companyId)
        .eq("customer_id", customerId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (!error && data) {
        events.push(...this.mapSchedulingRows(data as unknown as SchedulingBookingRow[]));
      }
    }

    const { data: legacy, error: legacyError } = await supabase
      .from("bookings")
      .select("id, service, booking_date, status, created_at, updated_at")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (!legacyError && legacy) {
      events.push(...this.mapLegacyRows(legacy as LegacyBookingRow[]));
    }

    return events.sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );
  }

  private mapSchedulingRows(rows: SchedulingBookingRow[]): TimelineEvent[] {
    const events: TimelineEvent[] = [];

    for (const booking of rows) {
      const joinedService = booking.scheduling_services;
      const serviceName = Array.isArray(joinedService)
        ? joinedService[0]?.name
        : joinedService?.name;
      const resolvedServiceName = serviceName ?? "Booking";
      const detail = truncateText(resolvedServiceName);
      const baseMetadata = {
        detail,
        searchText: [resolvedServiceName, booking.status, booking.source, "booking"].join(" "),
        filterGroup: "bookings" as const,
        bookingId: booking.id,
      };

      events.push({
        id: `${this.providerId}:created:${booking.id}`,
        type: "booking_created",
        occurredAt: booking.created_at,
        source: this.providerId,
        payload: { bookingId: booking.id, service: resolvedServiceName, status: booking.status },
        metadata: baseMetadata,
      });

      if (booking.status === "confirmed" || booking.status === "pending") {
        events.push({
          id: `${this.providerId}:confirmed:${booking.id}`,
          type: "booking_confirmed",
          occurredAt: booking.created_at,
          source: this.providerId,
          payload: { bookingId: booking.id, service: resolvedServiceName },
          metadata: baseMetadata,
        });
      }

      // Workflow-aligned timeline markers (Clinic pack event types / copy).
      if (booking.status === "checked_in" || booking.status === "with_nurse" || booking.status === "in_progress" || booking.status === "completed" || booking.status === "archived") {
        events.push({
          id: `${this.providerId}:checked_in:${booking.id}`,
          type: "booking_confirmed",
          occurredAt: booking.updated_at,
          source: this.providerId,
          payload: { bookingId: booking.id, service: resolvedServiceName, status: "checked_in" },
          metadata: {
            ...baseMetadata,
            detail: "Patient checked in.",
            searchText: `${baseMetadata.searchText} checked_in patient_checked_in`,
          },
        });
      }

      if (booking.status === "with_nurse" || booking.status === "in_progress" || booking.status === "completed" || booking.status === "archived") {
        events.push({
          id: `${this.providerId}:with_nurse:${booking.id}`,
          type: "booking_confirmed",
          occurredAt: booking.updated_at,
          source: this.providerId,
          payload: { bookingId: booking.id, service: resolvedServiceName, status: "with_nurse" },
          metadata: {
            ...baseMetadata,
            detail: "Patient sent to nurse.",
            searchText: `${baseMetadata.searchText} with_nurse patient_sent_to_nurse`,
          },
        });
      }

      if (booking.status === "in_progress" || booking.status === "completed" || booking.status === "archived") {
        events.push({
          id: `${this.providerId}:with_doctor:${booking.id}`,
          type: "booking_confirmed",
          occurredAt: booking.updated_at,
          source: this.providerId,
          payload: { bookingId: booking.id, service: resolvedServiceName, status: "in_progress" },
          metadata: {
            ...baseMetadata,
            detail: "Patient sent to doctor.",
            searchText: `${baseMetadata.searchText} with_doctor patient_sent_to_doctor`,
          },
        });
      }

      if (booking.status === "completed" || booking.status === "archived") {
        events.push({
          id: `${this.providerId}:completed:${booking.id}`,
          type: "booking_completed",
          occurredAt: booking.end_at,
          source: this.providerId,
          payload: { bookingId: booking.id, service: resolvedServiceName },
          metadata: {
            ...baseMetadata,
            detail: "Visit completed.",
            searchText: `${baseMetadata.searchText} visit_completed`,
          },
        });
      }

      if (booking.status === "archived") {
        events.push({
          id: `${this.providerId}:archived:${booking.id}`,
          type: "booking_completed",
          occurredAt: booking.updated_at,
          source: this.providerId,
          payload: { bookingId: booking.id, service: resolvedServiceName, status: "archived" },
          metadata: {
            ...baseMetadata,
            detail: "Operation archived.",
            searchText: `${baseMetadata.searchText} archived operation_archived`,
          },
        });
      }

      if (booking.notes?.includes("[clinic:triage_complete]")) {
        events.push({
          id: `${this.providerId}:triage:${booking.id}`,
          type: "booking_confirmed",
          occurredAt: booking.updated_at,
          source: this.providerId,
          payload: { bookingId: booking.id, service: resolvedServiceName, status: "triage_complete" },
          metadata: {
            ...baseMetadata,
            detail: "Triage completed.",
            searchText: `${baseMetadata.searchText} triage triage_completed`,
          },
        });
      }

      if (booking.status === "cancelled" || booking.status === "no_show") {
        events.push({
          id: `${this.providerId}:cancelled:${booking.id}`,
          type: "booking_cancelled",
          occurredAt: booking.updated_at,
          source: this.providerId,
          payload: { bookingId: booking.id, service: resolvedServiceName },
          metadata: baseMetadata,
        });
      }

      if (booking.status === "rescheduled") {
        events.push({
          id: `${this.providerId}:rescheduled:${booking.id}`,
          type: "booking_rescheduled",
          occurredAt: booking.updated_at,
          source: this.providerId,
          payload: {
            bookingId: booking.id,
            service: resolvedServiceName,
            bookingDate: booking.start_at,
          },
          metadata: {
            ...baseMetadata,
            detail: `${detail} · ${new Date(booking.start_at).toLocaleString()}`,
          },
        });
      }
    }

    return events;
  }

  private mapLegacyRows(rows: LegacyBookingRow[]): TimelineEvent[] {
    const events: TimelineEvent[] = [];

    for (const booking of rows) {
      const detail = truncateText(booking.service);
      const baseMetadata = {
        detail,
        searchText: [booking.service, booking.status, "booking"].join(" "),
        filterGroup: "bookings" as const,
        bookingId: booking.id,
      };

      events.push({
        id: `${this.providerId}:legacy:created:${booking.id}`,
        type: "booking_created",
        occurredAt: booking.created_at,
        source: this.providerId,
        payload: { bookingId: booking.id, service: booking.service, status: booking.status },
        metadata: baseMetadata,
      });

      if (booking.status === "Cancelled") {
        events.push({
          id: `${this.providerId}:legacy:cancelled:${booking.id}`,
          type: "booking_cancelled",
          occurredAt: booking.updated_at,
          source: this.providerId,
          payload: { bookingId: booking.id, service: booking.service },
          metadata: baseMetadata,
        });
      }
    }

    return events;
  }
}
