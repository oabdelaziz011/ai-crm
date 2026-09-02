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
  business_exception_id?: string | null;
  business_exception_item_id?: string | null;
  scheduling_services?: { name: string } | { name: string }[] | null;
};

type ExceptionTimelineContext = {
  exceptionId: string;
  comment: string | null;
  scope: string | null;
  exceptionDate: string | null;
  notificationStatus: string | null;
  providerMessageId: string | null;
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
    const trimmedCompanyId = companyId?.trim() || "";
    const trimmedCustomerId = customerId?.trim() || "";

    // Fail closed: Activity bookings require company_id + customer_id.
    if (!trimmedCompanyId || !trimmedCustomerId) {
      return [];
    }

    {
      const { data, error } = await supabase
        .from("scheduling_bookings")
        .select(
          "id, start_at, end_at, status, source, notes, created_at, updated_at, created_by, updated_by, business_exception_id, business_exception_item_id, scheduling_services(name)",
        )
        .eq("company_id", trimmedCompanyId)
        .eq("customer_id", trimmedCustomerId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (!error && data) {
        const rows = data as unknown as SchedulingBookingRow[];
        for (const row of rows) {
          if (row.created_by) actorIds.push(row.created_by);
          if (row.updated_by) actorIds.push(row.updated_by);
        }
        const actorNames = await fetchActorNames(actorIds);
        const exceptionContext = await this.loadExceptionContext(trimmedCompanyId, rows);
        events.push(...this.mapSchedulingRows(rows, actorNames, exceptionContext));
      }
    }

    {
      const { data: legacy, error: legacyError } = await supabase
        .from("bookings")
        .select("id, service, booking_date, status, created_at, updated_at, user_id")
        .eq("company_id", trimmedCompanyId)
        .eq("customer_id", trimmedCustomerId)
        .order("created_at", { ascending: false });

      if (!legacyError && legacy) {
        const rows = legacy as LegacyBookingRow[];
        const legacyActorIds = rows.map((row) => row.user_id ?? "").filter(Boolean);
        const actorNames = await fetchActorNames(legacyActorIds);
        events.push(...this.mapLegacyRows(rows, actorNames));
      }
    }

    return events.sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );
  }

  private async loadExceptionContext(
    companyId: string,
    rows: SchedulingBookingRow[],
  ): Promise<Map<string, ExceptionTimelineContext>> {
    const byBooking = new Map<string, ExceptionTimelineContext>();
    const linked = rows.filter((row) => row.business_exception_id && row.business_exception_item_id);
    if (linked.length === 0) return byBooking;

    const exceptionIds = [...new Set(linked.map((row) => row.business_exception_id!).filter(Boolean))];
    const itemIds = [...new Set(linked.map((row) => row.business_exception_item_id!).filter(Boolean))];

    const [{ data: exceptions }, { data: items }] = await Promise.all([
      supabase
        .from("business_appointment_exceptions")
        .select("id, comment, scope, exception_date")
        .eq("company_id", companyId)
        .in("id", exceptionIds),
      supabase
        .from("business_appointment_exception_items")
        .select("id, exception_id, notification_status, provider_message_id")
        .eq("company_id", companyId)
        .in("id", itemIds),
    ]);

    const exceptionById = new Map(
      (exceptions ?? []).map((row) => [
        String(row.id),
        {
          comment: typeof row.comment === "string" ? row.comment : null,
          scope: typeof row.scope === "string" ? row.scope : null,
          exceptionDate: typeof row.exception_date === "string" ? row.exception_date : null,
        },
      ]),
    );
    const itemById = new Map(
      (items ?? []).map((row) => [
        String(row.id),
        {
          exceptionId: String(row.exception_id),
          notificationStatus: typeof row.notification_status === "string" ? row.notification_status : null,
          providerMessageId:
            typeof row.provider_message_id === "string" ? row.provider_message_id : null,
        },
      ]),
    );

    for (const row of linked) {
      const exception = exceptionById.get(row.business_exception_id!);
      const item = itemById.get(row.business_exception_item_id!);
      if (!exception || !item) continue;
      byBooking.set(row.id, {
        exceptionId: row.business_exception_id!,
        comment: exception.comment,
        scope: exception.scope,
        exceptionDate: exception.exceptionDate,
        notificationStatus: item.notificationStatus,
        providerMessageId: item.providerMessageId,
      });
    }

    return byBooking;
  }

  private mapSchedulingRows(
    rows: SchedulingBookingRow[],
    actorNames: Map<string, string>,
    exceptionContext: Map<string, ExceptionTimelineContext> = new Map(),
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
        const exception = exceptionContext.get(booking.id);
        const cancelPayload: Record<string, unknown> = {
          bookingId: booking.id,
          service: resolvedServiceName,
        };
        let cancelDetail = detail;
        if (exception) {
          cancelPayload.exceptionId = exception.exceptionId;
          cancelPayload.comment = exception.comment;
          cancelPayload.scope = exception.scope;
          cancelPayload.exceptionDate = exception.exceptionDate;
          cancelPayload.notificationStatus = exception.notificationStatus;
          if (exception.providerMessageId) {
            cancelPayload.providerMessageId = exception.providerMessageId;
          }
          const commentSnippet = exception.comment ? truncateText(exception.comment) : null;
          cancelDetail = [detail, commentSnippet].filter(Boolean).join(" — ");
        }
        events.push(
          attachActor(
            {
              id: `${this.providerId}:cancelled:${booking.id}`,
              type: "booking_cancelled",
              occurredAt: booking.updated_at,
              source: this.providerId,
              payload: cancelPayload,
              metadata: {
                ...baseMetadata,
                detail: cancelDetail,
                searchText: [
                  baseMetadata.searchText,
                  exception?.exceptionId,
                  exception?.comment,
                  "business_exception",
                ]
                  .filter(Boolean)
                  .join(" "),
              },
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
