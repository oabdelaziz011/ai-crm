export type CreateBookingSchedulingSlot = {
  startAt: string;
  timezone: string;
  serviceId: string;
  resourceId: string;
};

export type CreateBookingInput = {
  companyId: string;
  userId: string;
  service: string;
  doctorId: string;
  locationId: string;
  appointmentDate: string;
  appointmentTime: string;
  customerId: string;
  durationMinutes?: number | null;
  notes?: string | null;
  /** Structured slot from available_slots lookup — preferred for scheduling-domain writes. */
  schedulingSlot?: CreateBookingSchedulingSlot | null;
};

export type CreateBookingResult = {
  bookingId: string;
  bookingDate: string;
  /** Company-scoped sequential reference when created via scheduling_bookings. */
  confirmationNumber?: string | null;
};

export type BookingRecord = {
  id: string;
  userId: string;
  customerId: string | null;
  service: string;
  doctorId: string | null;
  locationId: string | null;
  bookingDate: string;
  durationMinutes: number | null;
  notes: string | null;
  status: string;
};
