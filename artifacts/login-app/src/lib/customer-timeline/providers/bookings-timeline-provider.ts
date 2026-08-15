import { supabase } from "@/lib/supabase";
import type { TimelineActor, TimelineEvent, TimelineEventProvider, TimelineFetchInput } from "../types";
import { fetchActorNames, truncateText } from "../provider-utils";

type SchedulingBookingRow = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  source: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  scheduling_services?: { name: string } | { name: string }[] | null;
};

type LegacyBookingRow = {
  id: string;
  service: string;
  booking_date: string;
  status: string;
  created_at: string;
  updated_at: string;
  user_id: string | null;
};

function attachActor(
  event: TimelineEvent,
  actorId: string | null | undefined,
  actorNames: Map<string, string>,
): TimelineEvent {
  const id = actorId?.trim() || null;
  const label = id ? actorNames.get(id) ?? null : null;
  const actor: TimelineActor = {
    id,
    label,
    type: label ? "employee" : "system",
  };
  return {
    ...event,
    actor,
    metadata: {
      ...event.metadata,
      actor: label,
      actorId: id,
    },
  };
}

export class BookingsTimelineProvider implements TimelineEventProvider {
  readonly providerId = "bookings";

  async getEvents({ customerId, companyId }: TimelineFetchInput): Promise<TimelineEvent[]> {
    const events: TimelineEvent[] = [];
    const actorIds: string[] = [];

    if (companyId) {
      const { data, error } = await supabase
        .from("scheduling_bookings")
        .select(
          "id, start_at, end_at, status, source, notes, created_at, updated_at, created_by, updated_by, scheduling_services(name)",
        )
        .eq("company_id", companyId)
        .eq("customer_id", customerId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (!error && data) {
        const rows = data as unknown as SchedulingBookingRow[];
        for (const row of rows) {
          if (row.created_by) actorIds.push(row.created_by);
          if (row.updated_by) actorIds.push(row.updated_by);
        }
        const actorNames = await fetchActorNames(actorIds);
        events.push(...this.mapSchedulingRows(rows, actorNames));
      }
    }

    const { data: legacy, error: legacyError } = await supabase
      .from("bookings")
      .select("id, service, booking_date, status, created_at, updated_at, user_id")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (!legacyError && legacy) {
      const rows = legacy as LegacyBookingRow[];
      const legacyActorIds = rows.map((row) => row.user_id ?? "").filter(Boolean);
      const actorNames = await fetchActorNames(legacyActorIds);
      events.push(...this.mapLegacyRows(rows, actorNames));
    }

    return events.sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );
  }

  private mapSchedulingRows(
    rows: SchedulingBookingRow[],
    actorNames: Map<string, string>,
  ): TimelineEvent[] {
    const events: TimelineEvent[] = [];

    for (const booking of rows) {
      const joinedService = booking.scheduling_services;
      const serviceName = Array.isArray(joinedService)
        ? joinedService[0]?.name
        : joinedService?.name;
      const resolvedServiceName = serviceName ?? "Booking";
      const detail = truncateText(resolvedServiceName);
      const createdBy = booking.created_by;
      const updatedBy = booking.updated_by ?? booking.created_by;
      const baseMetadata = {
        detail,
        searchText: [resolvedServiceName, booking.status, booking.source, "booking"].join(" "),
        filterGroup: "bookings" as const,
        bookingId: booking.id,
      };

      events.push(
        attachActor(
          {
            id: `${this.providerId}:created:${booking.id}`,
            type: "booking_created",
            occurredAt: booking.created_at,
            source: this.providerId,
            payload: { bookingId: booking.id, service: resolvedServiceName, status: booking.status },
            metadata: baseMetadata,
          },
          createdBy,
          actorNames,
        ),
      );

      if (booking.status === "confirmed" || booking.status === "pending") {
        events.push(
          attachActor(
            {
              id: `${this.providerId}:confirmed:${booking.id}`,
              type: "booking_confirmed",
              occurredAt: booking.created_at,
              source: this.providerId,
              payload: { bookingId: booking.id, service: resolvedServiceName },
              metadata: baseMetadata,
            },
            createdBy,
            actorNames,
          ),
        );
      }

      if (
        booking.status === "checked_in" ||
        booking.status === "with_nurse" ||
        booking.status === "in_progress" ||
        booking.status === "completed" ||
        booking.status === "archived"
      ) {
        events.push(
          attachActor(
            {
              id: `${this.providerId}:checked_in:${booking.id}`,
              type: "booking_confirmed",
              occurredAt: booking.updated_at,
              source: this.providerId,
              payload: { bookingId: booking.id, service: resolvedServiceName, status: "checked_in" },
              metadata: {
                ...baseMetadata,
                detailKey: "patientCheckedIn",
                searchText: `${baseMetadata.searchText} checked_in patient_checked_in`,
              },
            },
            updatedBy,
            actorNames,
          ),
        );
      }

      if (
        booking.status === "with_nurse" ||
        booking.status === "in_progress" ||
        booking.status === "completed" ||
        booking.status === "archived"
      ) {
        events.push(
          attachActor(
            {
              id: `${this.providerId}:with_nurse:${booking.id}`,
              type: "booking_confirmed",
              occurredAt: booking.updated_at,
              source: this.providerId,
              payload: { bookingId: booking.id, service: resolvedServiceName, status: "with_nurse" },
              metadata: {
                ...baseMetadata,
                detailKey: "patientSentToNurse",
                searchText: `${baseMetadata.searchText} with_nurse patient_sent_to_nurse`,
              },
            },
            updatedBy,
            actorNames,
          ),
        );
      }

      if (booking.status === "in_progress" || booking.status === "completed" || booking.status === "archived") {
        events.push(
          attachActor(
            {
              id: `${this.providerId}:with_doctor:${booking.id}`,
              type: "booking_confirmed",
              occurredAt: booking.updated_at,
              source: this.providerId,
              payload: { bookingId: booking.id, service: resolvedServiceName, status: "in_progress" },
              metadata: {
                ...baseMetadata,
                detailKey: "patientSentToDoctor",
                searchText: `${baseMetadata.searchText} with_doctor patient_sent_to_doctor`,
              },
            },
            updatedBy,
            actorNames,
          ),
        );
      }

      if (booking.status === "completed" || booking.status === "archived") {
        events.push(
          attachActor(
            {
              id: `${this.providerId}:completed:${booking.id}`,
              type: "booking_completed",
              occurredAt: booking.end_at,
              source: this.providerId,
              payload: { bookingId: booking.id, service: resolvedServiceName },
              metadata: {
                ...baseMetadata,
                detailKey: "visitCompleted",
                searchText: `${baseMetadata.searchText} visit_completed`,
              },
            },
            updatedBy,
            actorNames,
          ),
        );
      }

      if (booking.status === "archived") {
        events.push(
          attachActor(
            {
              id: `${this.providerId}:archived:${booking.id}`,
              type: "booking_completed",
              occurredAt: booking.updated_at,
              source: this.providerId,
              payload: { bookingId: booking.id, service: resolvedServiceName, status: "archived" },
              metadata: {
                ...baseMetadata,
                detailKey: "operationArchived",
                searchText: `${baseMetadata.searchText} archived operation_archived`,
              },
            },
            updatedBy,
            actorNames,
          ),
        );
      }

      if (booking.notes?.includes("[clinic:triage_complete]")) {
        events.push(
          attachActor(
            {
              id: `${this.providerId}:triage:${booking.id}`,
              type: "booking_confirmed",
              occurredAt: booking.updated_at,
              source: this.providerId,
              payload: { bookingId: booking.id, service: resolvedServiceName, status: "triage_complete" },
              metadata: {
                ...baseMetadata,
                detailKey: "triageCompleted",
                searchText: `${baseMetadata.searchText} triage triage_completed`,
              },
            },
            updatedBy,
            actorNames,
          ),
        );
      }

      if (booking.status === "cancelled" || booking.status === "no_show") {
        events.push(
          attachActor(
            {
              id: `${this.providerId}:cancelled:${booking.id}`,
              type: "booking_cancelled",
              occurredAt: booking.updated_at,
              source: this.providerId,
              payload: { bookingId: booking.id, service: resolvedServiceName },
              metadata: baseMetadata,
            },
            updatedBy,
            actorNames,
          ),
        );
      }

      if (booking.status === "rescheduled") {
        events.push(
          attachActor(
            {
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
                detail: detail ? `${detail}` : null,
              },
            },
            updatedBy,
            actorNames,
          ),
        );
      }
    }

    return events;
  }

  private mapLegacyRows(rows: LegacyBookingRow[], actorNames: Map<string, string>): TimelineEvent[] {
    const events: TimelineEvent[] = [];

    for (const booking of rows) {
      const detail = truncateText(booking.service);
      const baseMetadata = {
        detail,
        searchText: [booking.service, booking.status, "booking"].join(" "),
        filterGroup: "bookings" as const,
        bookingId: booking.id,
      };

      events.push(
        attachActor(
          {
            id: `${this.providerId}:legacy:created:${booking.id}`,
            type: "booking_created",
            occurredAt: booking.created_at,
            source: this.providerId,
            payload: { bookingId: booking.id, service: booking.service, status: booking.status },
            metadata: baseMetadata,
          },
          booking.user_id,
          actorNames,
        ),
      );

      if (booking.status === "Cancelled") {
        events.push(
          attachActor(
            {
              id: `${this.providerId}:legacy:cancelled:${booking.id}`,
              type: "booking_cancelled",
              occurredAt: booking.updated_at,
              source: this.providerId,
              payload: { bookingId: booking.id, service: booking.service },
              metadata: baseMetadata,
            },
            booking.user_id,
            actorNames,
          ),
        );
      }
    }

    return events;
  }
}
