import { isFieldBinding, staticBinding, variableBinding } from "../field-binding/normalize.js";
import type { BookingLookupField } from "./lookup/booking-types.js";
import { BOOKING_LOOKUP_FIELDS } from "./lookup/booking-types.js";

export type FindBookingConfig = {
  lookupBy: BookingLookupField;
  value: unknown;
};

const DEFAULT_LOOKUP_BY: BookingLookupField = "booking_id";

export function normalizeFindBookingConfig(config: Record<string, unknown>): FindBookingConfig {
  const lookupByRaw = typeof config.lookupBy === "string" ? config.lookupBy.trim() : "";
  const lookupBy = BOOKING_LOOKUP_FIELDS.includes(lookupByRaw as BookingLookupField)
    ? (lookupByRaw as BookingLookupField)
    : DEFAULT_LOOKUP_BY;

  const value = isFieldBinding(config.value) ? config.value : staticBinding("");

  return { lookupBy, value };
}

export function createDefaultFindBookingConfig(): FindBookingConfig {
  return {
    lookupBy: DEFAULT_LOOKUP_BY,
    value: variableBinding("booking_id"),
  };
}
