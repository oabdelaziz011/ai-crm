import { isFieldBinding, staticBinding, variableBinding } from "../field-binding/normalize.js";

export type CancelBookingConfig = {
  bookingId: unknown;
};

export function normalizeCancelBookingConfig(config: Record<string, unknown>): CancelBookingConfig {
  const bookingId = isFieldBinding(config.bookingId)
    ? config.bookingId
    : isFieldBinding(config.booking)
      ? config.booking
      : variableBinding("booking_id");

  return { bookingId };
}
