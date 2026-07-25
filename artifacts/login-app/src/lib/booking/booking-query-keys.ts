export const BOOKINGS_KEY = ["bookings"] as const;
export const BOOKING_SLOTS_KEY = ["booking-slots"] as const;

export function bookingsListKey(companyId: string | null) {
  return [...BOOKINGS_KEY, companyId] as const;
}

export function bookingSlotsKey(
  companyId: string | null,
  resourceId: string | null,
  serviceId: string | null,
  date: string | null,
) {
  return [...BOOKING_SLOTS_KEY, companyId, resourceId, serviceId, date] as const;
}
