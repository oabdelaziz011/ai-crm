export const BOOKING_LOOKUP_FIELDS = ["booking_id", "customer_id", "phone", "date"] as const;
export type BookingLookupField = (typeof BOOKING_LOOKUP_FIELDS)[number];
