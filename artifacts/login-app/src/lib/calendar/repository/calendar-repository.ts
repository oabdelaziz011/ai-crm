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

export class CalendarRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listEventsInRange(params: ListCalendarEventsParams): Promise<CalendarEventRecord[]> {
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
        amount_cents,
        currency,
        visit_type,
        payment_status,
        discount_cents,
        tax_cents,
        invoice_id,
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

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as unknown as CalendarEventRecord[];
  }
}
