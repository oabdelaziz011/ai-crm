import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarEventRecord } from "@/lib/calendar/types/calendar-event";
import type { SchedulingBookingStatus } from "@/lib/scheduling/booking-domain";
import { CalendarRepository } from "@/lib/calendar/repository/calendar-repository";
import {
  getCalendarDateRangeBounds,
  getCalendarDayRange,
} from "@/lib/scheduling/operations/utilities/calendar-day-range";

export type OperationsListParams = {
  companyId: string;
  date: string;
  /** IANA timezone used for calendar-day UTC bounds. */
  timezone: string;
  branchId?: string | null;
  resourceIds?: string[];
  serviceIds?: string[];
  statuses?: SchedulingBookingStatus[];
};

export type OperationsRangeParams = Omit<OperationsListParams, "date"> & {
  dateFrom: string;
  dateTo: string;
};

export type OperationsBookingRecord = CalendarEventRecord & {
  created_at?: string;
  updated_at?: string;
  customers?: {
    id: string;
    name: string;
    phone?: string | null;
    email?: string | null;
  } | null;
};

export class OperationsRepository {
  private readonly calendarRepo: CalendarRepository;

  constructor(private readonly client: SupabaseClient) {
    this.calendarRepo = new CalendarRepository(client);
  }

  async listBookingsForDay(params: OperationsListParams): Promise<OperationsBookingRecord[]> {
    const { startUtc, endUtc } = getCalendarDayRange(params.date, params.timezone);
    const rows = await this.calendarRepo.listEventsInRange({
      companyId: params.companyId,
      rangeStart: startUtc,
      rangeEnd: endUtc,
      branchId: params.branchId,
      resourceIds: params.resourceIds,
      serviceIds: params.serviceIds,
      statuses: params.statuses?.length ? params.statuses : undefined,
    });

    return this.enrichCustomerContact(rows);
  }

  async listBookingsForDateRange(params: OperationsRangeParams): Promise<OperationsBookingRecord[]> {
    const { startUtc, endUtc } = getCalendarDateRangeBounds(
      params.dateFrom,
      params.dateTo,
      params.timezone,
    );
    const rows = await this.calendarRepo.listEventsInRange({
      companyId: params.companyId,
      rangeStart: startUtc,
      rangeEnd: endUtc,
      branchId: params.branchId,
      resourceIds: params.resourceIds,
      serviceIds: params.serviceIds,
      statuses: params.statuses?.length ? params.statuses : undefined,
    });

    return this.enrichCustomerContact(rows);
  }

  async getBookingById(
    companyId: string,
    bookingId: string,
  ): Promise<OperationsBookingRecord | null> {
    const { data, error } = await this.client
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
        updated_at,
        amount_cents,
        currency,
        visit_type,
        payment_status,
        discount_cents,
        tax_cents,
        invoice_id,
        confirmation_number,
        customers(id, name, phone, email),
        scheduling_services(id, name, duration_minutes, price_cents, currency),
        scheduling_resources(id, name, resource_type),
        branches(id, name)
      `,
      )
      .eq("company_id", companyId)
      .eq("id", bookingId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return (data as OperationsBookingRecord | null) ?? null;
  }

  async fetchBookingsForExport(params: OperationsListParams): Promise<OperationsBookingRecord[]> {
    return this.listBookingsForDay(params);
  }

  private async enrichCustomerContact(
    rows: CalendarEventRecord[],
  ): Promise<OperationsBookingRecord[]> {
    if (rows.length === 0) return [];

    const customerIds = [...new Set(rows.map((row) => row.customer_id))];
    const { data, error } = await this.client
      .from("customers")
      .select("id, phone, email")
      .in("id", customerIds);

    if (error) throw new Error(error.message);

    const contactById = new Map((data ?? []).map((row) => [row.id, row]));

    return rows.map((row) => {
      const contact = contactById.get(row.customer_id);
      const customer = row.customers
        ? {
            ...row.customers,
            phone: contact?.phone ?? null,
            email: contact?.email ?? null,
          }
        : contact
          ? {
              id: row.customer_id,
              name: "—",
              phone: contact.phone ?? null,
              email: contact.email ?? null,
            }
          : null;

      return { ...row, customers: customer };
    });
  }

}
