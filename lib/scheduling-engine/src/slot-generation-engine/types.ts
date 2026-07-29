/** Slot Generation Engine domain types (S4.4) — discrete bookable slots. */

import type { AvailabilityUnavailabilityReason } from "../availability-engine/types";
import type { LocalTimePeriod } from "../availability-engine/types";

/** Wall-clock slot start time (HH:mm) in the resource timezone. */
export type SlotStartTime = string;

export type GeneratedSlot = {
  start: SlotStartTime;
  /** Inclusive end (start + service duration). */
  end: SlotStartTime;
};

export type SlotGenerationRules = {
  durationMinutes: number;
  slotIntervalMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  allowOverbooking: boolean;
};

export type SlotGenerationOptions = {
  /** When true, trim same-day slots before now + min notice. */
  respectBookingRules?: boolean;
  minBookingNoticeMinutes?: number;
  referenceNow?: Date;
  timezone?: string;
  date?: string;
};

/** Normalized existing booking for conflict resolution (local wall-clock). */
export type ExistingBooking = {
  id: string;
  startMinutes: number;
  durationMinutes: number;
  status: "Pending" | "Confirmed" | "Cancelled";
};

export type ResolvedSlots = {
  available: boolean;
  date: string;
  timezone: string;
  resourceId: string;
  serviceId: string;
  durationMinutes: number;
  /** Effective working periods from Availability Engine (unchanged). */
  periods: LocalTimePeriod[];
  slots: SlotStartTime[];
  /** Detailed slot records with computed end times. */
  generatedSlots: GeneratedSlot[];
  reasons: AvailabilityUnavailabilityReason[];
  meta: {
    slotIntervalMinutes: number;
    bookingCount: number;
    slotsBeforeConflictRemoval: number;
  };
};

export type SlotGenerationSnapshot = {
  resourceId: string;
  serviceId: string;
  date: string;
  timezone: string;
  durationMinutes: number;
  periods: LocalTimePeriod[];
  availabilityReasons: AvailabilityUnavailabilityReason[];
  availabilityAvailable: boolean;
  bookingRules: SlotGenerationRules & {
    minBookingNoticeMinutes: number;
    maxBookingWindowDays: number;
  };
  existingBookings: ExistingBooking[];
  options: SlotGenerationOptions;
};

export type SlotUnavailabilityReason = AvailabilityUnavailabilityReason | "invalid_duration";
