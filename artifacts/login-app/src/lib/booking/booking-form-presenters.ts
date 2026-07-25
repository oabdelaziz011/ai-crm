import type { ResolvedSlots } from "@/lib/scheduling/slot-generation-engine/types";
import type { EligibleResourceRef } from "@/lib/scheduling/types";

/** i18n keys under forms.booking — resolved by the booking modal. */
export const BOOKING_SLOT_MESSAGE_KEYS = {
  holiday: "forms.booking.slotReasons.holiday",
  exceptionBlocked: "forms.booking.slotReasons.exceptionBlocked",
  noWorkingHours: "forms.booking.slotReasons.noWorkingHours",
  outsideBookingWindow: "forms.booking.slotReasons.outsideBookingWindow",
  insideMinimumNotice: "forms.booking.slotReasons.insideMinimumNotice",
  resourceUnavailable: "forms.booking.slotReasons.resourceUnavailable",
  allSlotsBooked: "forms.booking.slotReasons.allSlotsBooked",
  noSlotsRemaining: "forms.booking.slotReasons.noSlotsRemaining",
  noSlotsGeneric: "forms.booking.slotReasons.noSlotsGeneric",
} as const;

export type BookingSlotMessageKey =
  (typeof BOOKING_SLOT_MESSAGE_KEYS)[keyof typeof BOOKING_SLOT_MESSAGE_KEYS];

/**
 * Maps slot-engine output to a single business-friendly message key.
 * Does not duplicate engine logic — only interprets existing reasons and meta.
 */
export function resolveBookingSlotMessageKey(
  slotsResult: ResolvedSlots | undefined,
): BookingSlotMessageKey | null {
  if (!slotsResult) {
    return null;
  }

  if (slotsResult.available && slotsResult.slots.length > 0) {
    return null;
  }

  const reasons = new Set(slotsResult.reasons);

  if (reasons.has("holiday")) {
    return BOOKING_SLOT_MESSAGE_KEYS.holiday;
  }
  if (reasons.has("exception_blocked")) {
    return BOOKING_SLOT_MESSAGE_KEYS.exceptionBlocked;
  }
  if (reasons.has("weekly_closed") || reasons.has("missing_weekly_schedule")) {
    return BOOKING_SLOT_MESSAGE_KEYS.noWorkingHours;
  }
  if (reasons.has("outside_booking_window")) {
    return BOOKING_SLOT_MESSAGE_KEYS.outsideBookingWindow;
  }
  if (reasons.has("inside_minimum_notice")) {
    return BOOKING_SLOT_MESSAGE_KEYS.insideMinimumNotice;
  }
  if (
    reasons.has("resource_inactive") ||
    reasons.has("capability_missing") ||
    reasons.has("service_inactive") ||
    reasons.has("resource_not_found") ||
    reasons.has("service_not_found")
  ) {
    return BOOKING_SLOT_MESSAGE_KEYS.resourceUnavailable;
  }

  if (
    slotsResult.periods.length > 0 &&
    slotsResult.meta.slotsBeforeConflictRemoval > 0 &&
    slotsResult.slots.length === 0
  ) {
    return BOOKING_SLOT_MESSAGE_KEYS.allSlotsBooked;
  }

  if (slotsResult.periods.length > 0 && slotsResult.slots.length === 0) {
    return BOOKING_SLOT_MESSAGE_KEYS.noSlotsRemaining;
  }

  return BOOKING_SLOT_MESSAGE_KEYS.noSlotsGeneric;
}

/** Client-side eligibility filter (branch-aware when branchId is provided). */
export function filterEligibleBookingResources(
  resources: EligibleResourceRef[],
  branchId?: string | null,
): EligibleResourceRef[] {
  return resources.filter((resource) => {
    if (resource.status !== "active") {
      return false;
    }
    if (branchId && resource.branch_id != null && resource.branch_id !== branchId) {
      return false;
    }
    return true;
  });
}
