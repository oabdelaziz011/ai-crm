import { isFieldBinding, normalizeFieldBinding, variableBinding } from "../field-binding/normalize.js";

export type RescheduleBookingConfig = {
  bookingId: unknown;
  date: unknown;
  slotStart: unknown;
};

export function normalizeRescheduleBookingConfig(
  config: Record<string, unknown>,
): RescheduleBookingConfig {
  const bookingIdSource = isFieldBinding(config.bookingId)
    ? config.bookingId
    : isFieldBinding(config.booking)
      ? config.booking
      : config.bookingId;

  return {
    bookingId: normalizeFieldBinding(bookingIdSource, variableBinding("booking.id")),
    date: normalizeFieldBinding(config.date, variableBinding("selected_date")),
    slotStart: normalizeFieldBinding(config.slotStart, variableBinding("selected_slot.start_at")),
  };
}
