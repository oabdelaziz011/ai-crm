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
  totalSlotCount?: number;
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
  /** Pre-formatted Arabic-friendly summary the assistant should send to the customer. */
  customerSummary?: string;
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
  conversationId?: string;
  source?: "crm" | "whatsapp" | "ai_assistant" | "call_center" | "public_booking" | "api";
};

export type CreateBookingResult = {
  success: boolean;
  bookingId?: string;
  /** Authoritative scheduling_bookings.confirmation_number (e.g. BK-000044). */
  confirmationNumber?: string | null;
  status?: string;
  startAt?: string;
  endAt?: string;
  /** Optional display enrichment when the create path already resolved them. */
  customerName?: string | null;
  serviceName?: string | null;
  errors?: string[];
  message?: string;
  customerFacingMessage?: string;
};

export type SearchBookingsInput = {
  companyId: string;
  userId: string;
  /**
   * Trusted conversation customer for scoping.
   * Do not pass LLM-supplied customerId here.
   */
  trustedCustomerId?: string | null;
  /**
   * Optional patient/mobile phone. When set, bookings are resolved for CRM
   * customers matching this phone in the company (create_booking stores the patient phone customer).
   */
  phone?: string | null;
  daysBack?: number;
  conversationId?: string;
};

export type SearchBookingsResult = {
  success: boolean;
  bookings: Array<{
    bookingId: string;
    customerId: string;
    customerName: string;
    /** Confirmation number when present on the booking row. */
    reference?: string;
    scheduledAt: string;
    status: string;
    employeeName?: string;
    serviceName?: string;
  }>;
  total: number;
  message?: string;
  errors?: string[];
};

export type RescheduleBookingInput = {
  companyId: string;
  userId: string;
  bookingId?: string;
  /** Booking reference like BK-000025 — used when bookingId UUID is not known yet. */
  bookingReference?: string | null;
  date: string;
  slotStart: string;
  reason?: string;
  /** Trusted conversation customer — preferred for AI channel ownership. */
  trustedCustomerId?: string | null;
  /**
   * Optional patient/mobile phone. When trustedCustomerId is missing, phone matching
   * authorizes reschedule the same way cancel/check-in do.
   */
  phone?: string | null;
  conversationId?: string;
};

export type RescheduleBookingResult = {
  success: boolean;
  bookingId?: string;
  reference?: string;
  scheduledAt?: string;
  rescheduledAt?: string;
  errors?: string[];
  message?: string;
  customerFacingMessage?: string;
};

export type CancelBookingInput = {
  companyId: string;
  userId: string;
  bookingId?: string;
  /** Booking reference like BK-000025 — used when bookingId is not known yet. */
  bookingReference?: string | null;
  reason?: string;
  /** Trusted conversation customer — preferred for AI channel ownership. */
  trustedCustomerId?: string | null;
  /**
   * Optional patient/mobile phone. When trustedCustomerId does not own the booking
   * (patient CRM profile from create_booking), phone matching allows cancel for that patient.
   */
  phone?: string | null;
  /**
   * When true, the booking reference was shown to the customer in this conversation's
   * cancel list — allow cancel scoped to that booking without re-asking for phone.
   */
  conversationScopedCancel?: boolean;
  conversationId?: string;
};

export type CancelBookingResult = {
  success: boolean;
  bookingId?: string;
  cancelledAt?: string;
  status?: string;
  reference?: string;
  errors?: string[];
  message?: string;
  customerFacingMessage?: string;
};

export type CheckInBookingInput = {
  companyId: string;
  userId: string;
  bookingId?: string;
  bookingReference?: string;
  phone?: string | null;
  roomId?: string;
  /** Trusted conversation customer — required for AI channel ownership unless phone resolves owner. */
  trustedCustomerId?: string | null;
  conversationId?: string;
};

export type CheckInBookingResult = {
  success: boolean;
  bookingId?: string;
  /** Authoritative BK-… confirmation — never a UUID. */
  confirmationNumber?: string | null;
  checkedInAt?: string;
  status?: string;
  errors?: string[];
  message?: string;
  customerFacingMessage?: string;
};

export type CheckOutBookingInput = {
  companyId: string;
  userId: string;
  bookingId?: string;
  bookingReference?: string;
  phone?: string | null;
  /** Trusted conversation customer — required for AI channel ownership unless phone resolves owner. */
  trustedCustomerId?: string | null;
  conversationId?: string;
};

export type CheckOutBookingResult = {
  success: boolean;
  bookingId?: string;
  /** Authoritative BK-… confirmation — never a UUID. */
  confirmationNumber?: string | null;
  checkedOutAt?: string;
  status?: string;
  errors?: string[];
  message?: string;
  customerFacingMessage?: string;
};

export type BookingDomainServicePort = {
  createBooking(input: {
    companyId: string;
    customerId: string;
    resourceId: string;
    serviceId: string;
    date: string;
    slotStart: string;
    source: "ai_assistant" | "whatsapp" | "crm" | "call_center" | "public_booking" | "api";
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
      customer_id?: string;
      confirmation_number?: string | null;
    };
  }>;
  rescheduleBooking?(input: {
    companyId: string;
    bookingId: string;
    date: string;
    slotStart: string;
    updatedBy?: string | null;
    referenceNow?: Date;
  }): Promise<{
    previousBooking: { id: string; status: string };
    booking: {
      id: string;
      status: string;
      start_at: string;
      end_at: string;
      company_id: string;
      customer_id?: string;
      confirmation_number?: string | null;
    };
  }>;
  cancelBooking?(input: {
    companyId: string;
    bookingId: string;
    updatedBy?: string | null;
    reason?: string | null;
    notes?: string | null;
    referenceNow?: Date;
  }): Promise<{
    booking: {
      id: string;
      status: string;
      start_at: string;
      company_id: string;
      customer_id?: string;
      confirmation_number?: string | null;
      updated_at?: string;
    };
  }>;
  checkInBooking?(input: {
    companyId: string;
    bookingId: string;
    updatedBy?: string | null;
    referenceNow?: Date;
  }): Promise<{
    booking: {
      id: string;
      status: string;
      start_at: string;
      company_id: string;
      customer_id?: string;
      confirmation_number?: string | null;
      updated_at?: string;
    };
  }>;
  /**
   * Application Layer maps AI `check_out` → domain `completeBooking` (existing semantics).
   */
  completeBooking?(input: {
    companyId: string;
    bookingId: string;
    updatedBy?: string | null;
    referenceNow?: Date;
  }): Promise<{
    booking: {
      id: string;
      status: string;
      start_at: string;
      company_id: string;
      customer_id?: string;
      confirmation_number?: string | null;
      updated_at?: string;
    };
  }>;
};

export type ResolveCustomerIdForBookingInput = {
  companyId: string;
  userId: string;
  conversationId?: string;
  candidate: string;
};

/** Channel-agnostic scheduling port — hosts wire SlotGenerationEngine + AvailabilityEngine + BookingDomainService. */
export type SchedulingToolPorts = {
  searchAvailability(input: SearchAvailabilityInput): Promise<SearchAvailabilityResult>;
  findNextAvailable(input: FindNextAvailableInput): Promise<FindNextAvailableResult>;
  recommendAppointment(input: RecommendAppointmentInput): Promise<RecommendAppointmentResult>;
  createBooking(input: CreateBookingInput): Promise<CreateBookingResult>;
  resolveCustomerIdForBooking?(input: ResolveCustomerIdForBookingInput): Promise<string | null>;
  searchBookings(input: SearchBookingsInput): Promise<SearchBookingsResult>;
  rescheduleBooking(input: RescheduleBookingInput): Promise<RescheduleBookingResult>;
  cancelBooking(input: CancelBookingInput): Promise<CancelBookingResult>;
  checkInBooking(input: CheckInBookingInput): Promise<CheckInBookingResult>;
  checkOutBooking(input: CheckOutBookingInput): Promise<CheckOutBookingResult>;
};
