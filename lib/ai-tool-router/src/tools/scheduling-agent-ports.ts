import type {
  AlternativeBranchRecommendation,
  AlternativeResourceRecommendation,
  AppointmentRecommendation,
  NearestDateRecommendation,
} from "@workspace/scheduling-engine";

export type AvailabilitySlot = {
  start: string;
  end: string;
};

export type {
  AlternativeBranchRecommendation,
  AlternativeResourceRecommendation,
  AppointmentRecommendation,
  NearestDateRecommendation,
} from "@workspace/scheduling-engine";

export type SearchAvailabilityResourceResult = {
  resourceId: string;
  resourceName: string;
  durationMinutes: number;
  capacity: number;
  availableDates: string[];
  slots: Array<AvailabilitySlot & { date: string }>;
};

export type SearchAvailabilityInput = {
  companyId: string;
  userId: string;
  serviceId: string;
  resourceId?: string;
  branchId?: string;
  /** Single date (YYYY-MM-DD) to return slots for. */
  date?: string;
  /** Days to scan when date is omitted (default 7, min 1, max 90). */
  daysAhead?: number;
};

export type SearchAvailabilityResult = {
  success: boolean;
  serviceId: string;
  durationMinutes: number;
  availableDates: string[];
  resources: SearchAvailabilityResourceResult[];
  message?: string;
  searchedWindow?: number;
  nextSuggestion?: number | null;
};

export type FindNextAvailableInput = {
  companyId: string;
  userId: string;
  serviceId: string;
  resourceId?: string;
  branchId?: string;
  /** Days to scan (default 7, min 1, max 90). */
  daysAhead?: number;
};

export type FindNextAvailableSlotResult = {
  date: string;
  start: string;
  end: string;
  resourceId: string;
  resourceName: string;
  serviceId: string;
  durationMinutes: number;
  capacity: number;
  timezone: string;
};

export type FindNextAvailableResult = {
  success: boolean;
  searchedWindow: number;
  nextSuggestion?: number | null;
  message?: string;
  slot: FindNextAvailableSlotResult | null;
};

export type RecommendAppointmentInput = {
  companyId: string;
  userId: string;
  serviceId: string;
  preferredResourceId?: string;
  preferredBranchId?: string;
  preferredDate?: string;
  preferredTime?: string;
  daysAhead?: number;
};

export type RecommendAppointmentResult = {
  success: boolean;
  searchedWindow: number;
  recommendations: AppointmentRecommendation[];
  alternativeResource: AlternativeResourceRecommendation | null;
  alternativeBranch: AlternativeBranchRecommendation | null;
  nearestDate: NearestDateRecommendation | null;
  message?: string;
  nextSuggestion?: number | null;
};

export type CreateBookingInput = {
  companyId: string;
  userId: string;
  customerId: string;
  serviceId: string;
  resourceId: string;
  date: string;
  slotStart: string;
  branchId?: string;
  notes?: string;
};

export type CreateBookingResult = {
  success: boolean;
  bookingId?: string;
  status?: string;
  startAt?: string;
  endAt?: string;
  errors?: string[];
  message?: string;
};

export type SearchBookingsInput = {
  companyId: string;
  userId: string;
  customerId?: string;
  daysBack?: number;
};

export type SearchBookingsResult = {
  success: boolean;
  bookings: Array<{
    bookingId: string;
    customerId: string;
    customerName: string;
    reference: string;
    scheduledAt: string;
    status: string;
    employeeName?: string;
    serviceName?: string;
  }>;
  total: number;
  message?: string;
};

export type RescheduleBookingInput = {
  companyId: string;
  userId: string;
  bookingId: string;
  date: string;
  slotStart: string;
  reason?: string;
};

export type RescheduleBookingResult = {
  success: boolean;
  bookingId?: string;
  scheduledAt?: string;
  rescheduledAt?: string;
  errors?: string[];
  message?: string;
};

export type CancelBookingInput = {
  companyId: string;
  userId: string;
  bookingId: string;
  reason?: string;
};

export type CancelBookingResult = {
  success: boolean;
  bookingId?: string;
  cancelledAt?: string;
  status?: string;
  errors?: string[];
  message?: string;
};

export type CheckInBookingInput = {
  companyId: string;
  userId: string;
  bookingId: string;
  roomId?: string;
};

export type CheckInBookingResult = {
  success: boolean;
  bookingId?: string;
  checkedInAt?: string;
  status?: string;
  errors?: string[];
  message?: string;
};

export type CheckOutBookingInput = {
  companyId: string;
  userId: string;
  bookingId: string;
};

export type CheckOutBookingResult = {
  success: boolean;
  bookingId?: string;
  checkedOutAt?: string;
  status?: string;
  errors?: string[];
  message?: string;
};

export type BookingDomainServicePort = {
  createBooking(input: {
    companyId: string;
    customerId: string;
    resourceId: string;
    serviceId: string;
    date: string;
    slotStart: string;
    source: "ai_assistant";
    notes?: string | null;
    createdBy?: string | null;
    branchId?: string | null;
    referenceNow?: Date;
  }): Promise<{
    booking: {
      id: string;
      status: string;
      start_at: string;
      end_at: string;
      company_id: string;
    };
  }>;
};

/** Channel-agnostic scheduling port — hosts wire SlotGenerationEngine + AvailabilityEngine + BookingDomainService. */
export type SchedulingToolPorts = {
  searchAvailability(input: SearchAvailabilityInput): Promise<SearchAvailabilityResult>;
  findNextAvailable(input: FindNextAvailableInput): Promise<FindNextAvailableResult>;
  recommendAppointment(input: RecommendAppointmentInput): Promise<RecommendAppointmentResult>;
  createBooking(input: CreateBookingInput): Promise<CreateBookingResult>;
  searchBookings(input: SearchBookingsInput): Promise<SearchBookingsResult>;
  rescheduleBooking(input: RescheduleBookingInput): Promise<RescheduleBookingResult>;
  cancelBooking(input: CancelBookingInput): Promise<CancelBookingResult>;
  checkInBooking(input: CheckInBookingInput): Promise<CheckInBookingResult>;
  checkOutBooking(input: CheckOutBookingInput): Promise<CheckOutBookingResult>;
};
