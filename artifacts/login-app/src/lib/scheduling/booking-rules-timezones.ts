/** Curated IANA timezones for booking-rules UI (business operating zones). */
export const BOOKING_RULES_TIMEZONES = [
  "UTC",
  "Africa/Cairo",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
] as const;

export type BookingRulesTimezone = (typeof BOOKING_RULES_TIMEZONES)[number];
