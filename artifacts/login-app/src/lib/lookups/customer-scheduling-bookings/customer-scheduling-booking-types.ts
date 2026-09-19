export const CUSTOMER_SCHEDULING_BOOKINGS_LOOKUP = "customer_scheduling_bookings" as const;

/** Instagram interactive-list / quick-reply title hard limit. */
export const CUSTOMER_SCHEDULING_BOOKING_TITLE_MAX = 20;

export const CUSTOMER_SCHEDULING_BOOKINGS_LIMIT = 25;

/** Statuses the scheduling domain can reschedule (pending → / confirmed → rescheduled). */
export const RESCHEDULABLE_SCHEDULING_BOOKING_STATUSES = ["pending", "confirmed"] as const;

export type ReschedulableSchedulingBookingStatus =
  (typeof RESCHEDULABLE_SCHEDULING_BOOKING_STATUSES)[number];

export type CustomerSchedulingBookingRecord = {
  id: string;
  customer_id: string;
  service_id: string;
  resource_id: string;
  start_at: string;
  end_at: string;
  timezone: string;
  status: string;
  confirmation_number: string | null;
  service_name: string;
  resource_name: string;
  display_label: string;
};
