import { TimezoneResolver } from "@/lib/scheduling/availability-engine/timezone-resolver";
import type { RescheduleBookingInput, RescheduleBookingResult } from "@workspace/automation-platform";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function resolveLocalSlotFromInstant(startAt: string, timezone: string): { date: string; slotStart: string } {
  const instant = TimezoneResolver.parseInstant(startAt);
  return {
    date: TimezoneResolver.localDateForInstant(instant, timezone),
    slotStart: TimezoneResolver.localTimeForInstant(instant, timezone),
  };
}

/**
 * Convert workflow date/slotStart into the local date + HH:MM contract
 * required by BookingDomainService.rescheduleBooking.
 */
export function resolveRescheduleSlotForDomain(input: {
  date: string;
  slotStart: string;
  timezone?: string | null;
}): { date: string; slotStart: string } {
  const date = input.date.trim();
  const slotStart = input.slotStart.trim();
  const timezone = input.timezone?.trim() || "UTC";

  if (slotStart.includes("T")) {
    const local = resolveLocalSlotFromInstant(slotStart, timezone);
    return {
      date: DATE_ONLY_PATTERN.test(date) ? date : local.date,
      slotStart: local.slotStart,
    };
  }

  if (date.includes("T")) {
    const local = resolveLocalSlotFromInstant(date, timezone);
    return {
      date: local.date,
      slotStart: slotStart || local.slotStart,
    };
  }

  return { date, slotStart };
}

export async function rescheduleBookingViaSchedulingDomain(
  domain: {
    rescheduleBooking(input: {
      companyId: string;
      bookingId: string;
      date: string;
      slotStart: string;
      updatedBy?: string | null;
    }): Promise<RescheduleBookingResult>;
  },
  input: RescheduleBookingInput,
): Promise<RescheduleBookingResult> {
  const slot = resolveRescheduleSlotForDomain(input);
  return domain.rescheduleBooking({
    companyId: input.companyId,
    bookingId: input.bookingId,
    date: slot.date,
    slotStart: slot.slotStart,
    updatedBy: input.updatedBy ?? null,
  });
}
