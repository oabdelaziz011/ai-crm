import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarEventRecord } from "@/lib/calendar/types/calendar-event";
import type { SchedulingBookingStatus } from "@/lib/scheduling/booking-domain";
import { CalendarRepository } from "@/lib/calendar/repository/calendar-repository";

export type OperationsListParams = {
  companyId: string;
  date: string;
  branchId?: string | null;
  resourceIds?: string[];
  serviceIds?: string[];
  statuses?: SchedulingBookingStatus[];
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
    const { rangeStart, rangeEnd } = this.dayBounds(params.date);
    const rows = await this.calendarRepo.listEventsInRange({
      companyId: params.companyId,
      rangeStart,
      rangeEnd,
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
        customers(id, name, phone, email),
        scheduling_services(id, name, duration_minutes),
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

  private dayBounds(date: string): { rangeStart: string; rangeEnd: string } {
    const anchor = Date.parse(`${date}T12:00:00.000Z`);
    const start = new Date(anchor - 14 * 60 * 60 * 1000);
    const end = new Date(anchor + 14 * 60 * 60 * 1000);
    return { rangeStart: start.toISOString(), rangeEnd: end.toISOString() };
  }
}
