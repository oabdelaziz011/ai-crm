import { BookingService } from "../crm/booking-service.js";
import type { BookingRepositoryPort } from "../crm/booking-repository-port.js";
import type { CreateBookingInput, CreateBookingResult } from "../crm/types/create-booking-input.js";
import type { FindBookingInput, FindBookingResult } from "../crm/types/find-booking-input.js";
import type { CancelBookingInput, CancelBookingResult, UpdateBookingInput, UpdateBookingResult } from "../crm/types/booking-mutation-input.js";

export interface BookingServicePort {
  findBooking(input: FindBookingInput): Promise<FindBookingResult>;
  createBooking(input: CreateBookingInput): Promise<CreateBookingResult>;
  updateBooking(input: UpdateBookingInput): Promise<UpdateBookingResult>;
  cancelBooking(input: CancelBookingInput): Promise<CancelBookingResult>;
}

export class DefaultBookingServicePort implements BookingServicePort {
  private readonly service: BookingService;

  constructor(repository: BookingRepositoryPort) {
    this.service = new BookingService(repository);
  }

  findBooking(input: FindBookingInput): Promise<FindBookingResult> {
    return this.service.findBooking(input);
  }

  createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
    return this.service.createBooking(input);
  }

  updateBooking(input: UpdateBookingInput): Promise<UpdateBookingResult> {
    return this.service.updateBooking(input);
  }

  cancelBooking(input: CancelBookingInput): Promise<CancelBookingResult> {
    return this.service.cancelBooking(input);
  }
}

export class InMemoryBookingServicePort extends DefaultBookingServicePort {
  constructor(repository: BookingRepositoryPort) {
    super(repository);
  }
}
