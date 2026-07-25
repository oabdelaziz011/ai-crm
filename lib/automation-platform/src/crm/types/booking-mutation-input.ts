import type { BookingRecord } from "./create-booking-input.js";

export type UpdateBookingInput = {
  companyId: string;
  userId: string;
  bookingId: string;
  field: string;
  value: string;
};

export type UpdateBookingResult = {
  booking: BookingRecord;
};

export type CancelBookingInput = {
  companyId: string;
  userId: string;
  bookingId: string;
};

export type CancelBookingResult = {
  booking: BookingRecord;
};
