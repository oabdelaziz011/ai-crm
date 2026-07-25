import type { CalendarInteractionIntent } from "@/lib/calendar/types/calendar-interaction";
import type {
  CreateBookingInput,
  RescheduleBookingInput,
} from "@/lib/scheduling/booking-domain";

export function createBookingIntentToDomainInput(
  companyId: string,
  intent: Extract<CalendarInteractionIntent, { type: "create" }>["payload"],
  createdBy?: string | null,
): CreateBookingInput {
  return {
    companyId,
    customerId: intent.customerId,
    resourceId: intent.resourceId,
    serviceId: intent.serviceId,
    date: intent.date,
    slotStart: intent.slotStart,
    source: "crm",
    notes: intent.notes,
    createdBy,
    branchId: intent.branchId,
  };
}

export function rescheduleIntentToDomainInput(
  companyId: string,
  intent: Extract<CalendarInteractionIntent, { type: "reschedule" }>["payload"],
  updatedBy?: string | null,
): RescheduleBookingInput {
  return {
    companyId,
    bookingId: intent.bookingId,
    date: intent.date,
    slotStart: intent.slotStart,
    updatedBy,
  };
}
