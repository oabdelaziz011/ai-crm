import { isFieldBinding, staticBinding } from "../field-binding/normalize.js";

export type UpdateBookingConfig = {
  bookingId: unknown;
  field: string;
  value: unknown;
};

export function normalizeUpdateBookingConfig(config: Record<string, unknown>): UpdateBookingConfig {
  const field = typeof config.field === "string" ? config.field.trim() : "";
  const bookingId = isFieldBinding(config.bookingId)
    ? config.bookingId
    : isFieldBinding(config.booking)
      ? config.booking
      : staticBinding(typeof config.bookingId === "string" ? config.bookingId : "");
  const value = isFieldBinding(config.value) ? config.value : staticBinding("");

  return { bookingId, field, value };
}
