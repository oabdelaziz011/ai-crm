import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LEGACY_BOOKING_LIST_COLUMNS,
  SCHEDULING_BOOKING_LIST_COLUMNS,
} from "@/lib/crm/crm-query-columns";
import { BOOKING_LIST_MAX_ROWS } from "@/lib/crm/crm-list-config";
import {
  mergeBookingLists,
  schedulingBookingToAppBooking,
  type AppBooking,
  type SchedulingBookingListRow,
} from "@/lib/booking/booking-view-adapter";
import type { Booking } from "@/lib/types";

export class BookingListService {
  constructor(private readonly client: SupabaseClient) {}

  async listForCompany(companyId: string, userId: string): Promise<AppBooking[]> {
    const [scheduling, legacy] = await Promise.all([
      this.listSchedulingBookings(companyId, userId),
      this.listLegacyBookings(userId),
    ]);
    return mergeBookingLists(scheduling, legacy);
  }

  async listForCustomer(companyId: string, customerId: string, userId: string): Promise<AppBooking[]> {
    const all = await this.listForCompany(companyId, userId);
    return all.filter((item) => item.customer_id === customerId);
  }

  private async listSchedulingBookings(companyId: string, userId: string): Promise<AppBooking[]> {
    const { data, error } = await this.client
      .from("scheduling_bookings")
      .select(SCHEDULING_BOOKING_LIST_COLUMNS)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .not("status", "eq", "rescheduled")
      .order("start_at", { ascending: true })
      .limit(BOOKING_LIST_MAX_ROWS);

    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as SchedulingBookingListRow[]).map((row) =>
      schedulingBookingToAppBooking(row, userId),
    );
  }

  private async listLegacyBookings(userId: string): Promise<Booking[]> {
    const { data, error } = await this.client
      .from("bookings")
      .select(LEGACY_BOOKING_LIST_COLUMNS)
      .eq("user_id", userId)
      .order("booking_date", { ascending: true })
      .limit(BOOKING_LIST_MAX_ROWS);

    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Booking[];
  }
}
