/**
 * Workflow-platform contract for scheduling-domain reschedule.
 * Matches BookingDomainService.rescheduleBooking — not the legacy CRM `bookings` table.
 */
export type RescheduleBookingInput = {
  companyId: string;
  bookingId: string;
  /** Local calendar date YYYY-MM-DD, or an ISO instant when paired with timezone. */
  date: string;
  /** Local wall-clock HH:MM, or an ISO instant (converted by the scheduling adapter). */
  slotStart: string;
  updatedBy?: string | null;
  /** IANA timezone used only when slotStart (or date) is an instant. */
  timezone?: string | null;
};

export type RescheduleBookingRecord = {
  id: string;
  status: string;
  start_at: string;
  end_at?: string;
  timezone?: string;
  company_id?: string;
  customer_id?: string | null;
  service_id?: string | null;
  resource_id?: string | null;
  confirmation_number?: string | null;
  rescheduled_from_id?: string | null;
};

export type RescheduleBookingResult = {
  previousBooking: RescheduleBookingRecord;
  booking: RescheduleBookingRecord;
};
