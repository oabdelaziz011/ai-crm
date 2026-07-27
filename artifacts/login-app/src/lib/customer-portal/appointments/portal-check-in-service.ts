import type { SupabaseClient } from "@supabase/supabase-js";
import { getBookingDomainServices } from "@/lib/scheduling/booking-domain";

/** Online check-in — reuses BookingDomainService.checkInBooking. */
export class PortalCheckInService {
  constructor(private readonly client: SupabaseClient) {}

  async checkInByToken(token: string): Promise<{ bookingId: string; status: string }> {
    const { data, error } = await this.client.rpc("portal_consume_check_in_token", {
      p_token: token,
    });
    if (error) throw new Error(error.message);

    const row = data as Record<string, string>;
    const domain = getBookingDomainServices();
    const result = await domain.bookingDomain.checkInBooking({
      companyId: row.company_id,
      bookingId: row.booking_id,
      updatedBy: null,
    });

    return { bookingId: result.booking.id, status: result.booking.status };
  }

  async generateCheckInLink(companyId: string, bookingId: string): Promise<string> {
    const { data, error } = await this.client.rpc("portal_create_check_in_token", {
      p_company_id: companyId,
      p_booking_id: bookingId,
    });
    if (error) throw new Error(error.message);
    const row = data as Record<string, string>;
    return row.check_in_url;
  }
}
