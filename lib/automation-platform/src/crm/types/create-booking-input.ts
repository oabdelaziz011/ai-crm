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
};

export type CreateBookingResult = {
  bookingId: string;
  bookingDate: string;
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
