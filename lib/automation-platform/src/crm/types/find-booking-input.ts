import type { BookingRecord } from "./create-booking-input.js";
import type { BookingLookupField } from "../lookup/booking-types.js";

export type FindBookingInput = {
  companyId: string;
  userId: string;
  lookupBy: BookingLookupField;
  lookupValue: string;
};

export type FindBookingResult =
  | { status: "found"; count: 1; booking: BookingRecord }
  | { status: "not_found"; count: 0 }
  | { status: "duplicate"; count: number };
