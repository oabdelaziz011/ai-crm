import type {
  CreateBookingInput,
  RescheduleBookingInput,
} from "@/lib/scheduling/booking-domain";

export type CreateBookingIntent = Pick<
  CreateBookingInput,
  "customerId" | "resourceId" | "serviceId" | "date" | "slotStart" | "branchId" | "notes"
>;

export type RescheduleIntent = Pick<
  RescheduleBookingInput,
  "bookingId" | "date" | "slotStart"
>;

export type CancelIntent = {
  bookingId: string;
};

export type CompleteIntent = {
  bookingId: string;
};

export type ResizeIntent = {
  bookingId: string;
  date: string;
  slotStart: string;
};

export type CalendarInteractionIntent =
  | { type: "create"; payload: CreateBookingIntent }
  | { type: "reschedule"; payload: RescheduleIntent }
  | { type: "resize"; payload: ResizeIntent }
  | { type: "cancel"; payload: CancelIntent }
  | { type: "complete"; payload: CompleteIntent }
  | { type: "select-event"; payload: { eventId: string } }
  | { type: "select-slot"; payload: { date: string; resourceId?: string | null } };
