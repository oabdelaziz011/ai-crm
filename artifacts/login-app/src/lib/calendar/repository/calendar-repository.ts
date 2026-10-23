import type { SupabaseClient } from "@supabase/supabase-js";
import type { SchedulingBookingStatus } from "@/lib/scheduling/booking-domain";
import type { CalendarEventRecord } from "@/lib/calendar/types/calendar-event";

export type ListCalendarEventsParams = {
  companyId: string;
  rangeStart: string;
  rangeEnd: string;
  resourceIds?: string[];
  branchId?: string | null;
  serviceIds?: string[];
  statuses?: SchedulingBookingStatus[];
};

/** PostgREST caps each response (default 1000 rows), so ranges are read in batches. */
const LIST_BATCH_SIZE = 1000;

export class CalendarRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listEventsInRange(params: ListCalendarEventsParams): Promise<CalendarEventRecord[]> {
    const records: CalendarEventRecord[] = [];
    for (let from = 0; ; from += LIST_BATCH_SIZE) {
      const { data, error } = await this.buildRangeQuery(params)
        .order("id", { ascending: true })
        .range(from, from + LIST_BATCH_SIZE - 1);
      if (error) {
        throw new Error(error.message);
      }
      const batch = (data ?? []) as unknown as CalendarEventRecord[];
      records.push(...batch);
      if (batch.length < LIST_BATCH_SIZE) break;
    }
    return records;
  }

  private buildRangeQuery(params: ListCalendarEventsParams) {
    let query = this.client
      .from("scheduling_bookings")
      .select(
        `
        id,
        company_id,
        branch_id,
        customer_id,
        resource_id,
        service_id,
        start_at,
        end_at,
        timezone,
        status,
        source,
        notes,
        version,
        created_by,
        created_at,
        amount_cents,
        currency,
        visit_type,
        payment_status,
        discount_cents,
        tax_cents,
        invoice_id,
        confirmation_number,
        customers(id, name),
        scheduling_services(id, name, duration_minutes, price_cents, currency),
        scheduling_resources(id, name, resource_type),
        branches(id, name)
      `,
      )
      .eq("company_id", params.companyId)
      .is("deleted_at", null)
      .not("status", "eq", "rescheduled")
      .lt("start_at", params.rangeEnd)
      .gt("end_at", params.rangeStart)
      .order("start_at", { ascending: true });

    if (params.branchId) {
      query = query.eq("branch_id", params.branchId);
    }

    if (params.resourceIds?.length) {
      query = query.in("resource_id", params.resourceIds);
    }

    if (params.serviceIds?.length) {
      query = query.in("service_id", params.serviceIds);
    }

    if (params.statuses?.length) {
      query = query.in("status", params.statuses);
    }

    return query;
  }
}
