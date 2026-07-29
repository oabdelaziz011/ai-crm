export type AvailabilitySlot = {
  start: string;
  end: string;
};

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
  /** Scan this many days ahead for available dates when date is omitted. */
  daysAhead?: number;
};

export type SearchAvailabilityResult = {
  success: boolean;
  serviceId: string;
  durationMinutes: number;
  availableDates: string[];
  resources: SearchAvailabilityResourceResult[];
  message?: string;
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
  createBooking(input: CreateBookingInput): Promise<CreateBookingResult>;
};
