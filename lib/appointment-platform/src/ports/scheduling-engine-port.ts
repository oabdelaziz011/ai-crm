import type {
  CancelBookingInput,
  CancelBookingResult,
  CheckInBookingResult,
  CompleteBookingResult,
  CreateBookingInput,
  CreateBookingResult,
  MarkNoShowBookingResult,
  RescheduleBookingInput,
  RescheduleBookingResult,
  BookingMutationContext,
  BookingValidationResult,
} from "@workspace/scheduling-engine";

/** Delegates to @workspace/scheduling-engine BookingDomainService — no duplicated logic. */
export interface SchedulingEnginePort {
  createBooking(input: CreateBookingInput): Promise<CreateBookingResult>;
  cancelBooking(input: CancelBookingInput): Promise<CancelBookingResult>;
  rescheduleBooking(input: RescheduleBookingInput): Promise<RescheduleBookingResult>;
  checkInBooking(input: BookingMutationContext): Promise<CheckInBookingResult>;
  markNoShowBooking(
    input: BookingMutationContext & { gracePeriodMinutes?: number },
  ): Promise<MarkNoShowBookingResult>;
  completeBooking(input: BookingMutationContext): Promise<CompleteBookingResult>;
  validateBooking(
    input: Omit<CreateBookingInput, "source" | "notes" | "createdBy" | "branchId"> & {
      excludeBookingId?: string;
    },
  ): Promise<BookingValidationResult>;
}

export interface AvailabilityEnginePort {
  getAvailableSlots(
    companyId: string,
    resourceId: string,
    serviceId: string,
    date: string,
    options?: { respectBookingRules?: boolean; referenceNow?: Date },
  ): Promise<{
    available: boolean;
    date: string;
    timezone: string;
    resourceId: string;
    serviceId: string;
    durationMinutes: number;
    slots: string[];
    generatedSlots: Array<{ start: string; end: string }>;
  }>;
}

export interface SlotGenerationEnginePort {
  getAvailableSlots: AvailabilityEnginePort["getAvailableSlots"];
}
