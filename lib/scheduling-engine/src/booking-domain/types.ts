/** Scheduling booking domain types (S4.5). */

export const SCHEDULING_BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "checked_in",
  "completed",
  "cancelled",
  "no_show",
  "rescheduled",
] as const;

export type SchedulingBookingStatus = (typeof SCHEDULING_BOOKING_STATUSES)[number];

export const SCHEDULING_BOOKING_SOURCES = [
  "crm",
  "whatsapp",
  "ai_assistant",
  "call_center",
  "public_booking",
  "api",
] as const;

export type SchedulingBookingSource = (typeof SCHEDULING_BOOKING_SOURCES)[number];

/** Statuses that block resource time for slot generation. */
export const ACTIVE_BOOKING_STATUSES: SchedulingBookingStatus[] = [
  "pending",
  "confirmed",
  "checked_in",
];

export type SchedulingBooking = {
  id: string;
  company_id: string;
  branch_id: string | null;
  customer_id: string;
  resource_id: string;
  service_id: string;
  start_at: string;
  end_at: string;
  timezone: string;
  status: SchedulingBookingStatus;
  source: SchedulingBookingSource;
  notes: string | null;
  rescheduled_from_id: string | null;
  version: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  invoice_id?: string | null;
};

export type SchedulingBookingInsert = {
  company_id: string;
  branch_id?: string | null;
  customer_id: string;
  resource_id: string;
  service_id: string;
  start_at: string;
  end_at: string;
  timezone: string;
  status?: SchedulingBookingStatus;
  source: SchedulingBookingSource;
  notes?: string | null;
  rescheduled_from_id?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
};

export type CreateBookingInput = {
  companyId: string;
  customerId: string;
  resourceId: string;
  serviceId: string;
  date: string;
  slotStart: string;
  source: SchedulingBookingSource;
  notes?: string | null;
  createdBy?: string | null;
  branchId?: string | null;
  referenceNow?: Date;
};

export type RescheduleBookingInput = {
  companyId: string;
  bookingId: string;
  date: string;
  slotStart: string;
  updatedBy?: string | null;
  referenceNow?: Date;
};

export type BookingMutationContext = {
  companyId: string;
  bookingId: string;
  updatedBy?: string | null;
  referenceNow?: Date;
};

export type CancelBookingInput = BookingMutationContext & {
  reason?: string | null;
  notes?: string | null;
};

export type CheckInBookingResult = {
  booking: SchedulingBooking;
};

export type MarkNoShowBookingResult = {
  booking: SchedulingBooking;
};

export type BookingValidationErrorCode =
  | "resource_not_found"
  | "resource_inactive"
  | "service_not_found"
  | "service_inactive"
  | "customer_not_found"
  | "capability_missing"
  | "slot_unavailable"
  | "booking_conflict"
  | "outside_booking_window"
  | "inside_minimum_notice"
  | "company_mismatch"
  | "invalid_date"
  | "invalid_slot_time"
  | "booking_not_found"
  | "invalid_status_transition"
  | "cancellation_window_expired"
  | "reschedule_window_expired";

export type BookingValidationResult = {
  valid: boolean;
  errors: BookingValidationErrorCode[];
  context?: {
    timezone: string;
    durationMinutes: number;
    startAt: string;
    endAt: string;
    branchId: string | null;
  };
};

export type CreateBookingResult = {
  booking: SchedulingBooking;
};

export type CancelBookingResult = {
  booking: SchedulingBooking;
};

export type CompleteBookingResult = {
  booking: SchedulingBooking;
};

export type RescheduleBookingResult = {
  previousBooking: SchedulingBooking;
  booking: SchedulingBooking;
};
