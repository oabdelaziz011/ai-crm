import { BookingService } from "../crm/booking-service.js";
import type { BookingRepositoryPort } from "../crm/booking-repository-port.js";
import type { CreateBookingInput, CreateBookingResult } from "../crm/types/create-booking-input.js";

export interface BookingServicePort {
  createBooking(input: CreateBookingInput): Promise<CreateBookingResult>;
}

export class DefaultBookingServicePort implements BookingServicePort {
  private readonly service: BookingService;

  constructor(repository: BookingRepositoryPort) {
    this.service = new BookingService(repository);
  }

  createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
    return this.service.createBooking(input);
  }
}

export class InMemoryBookingServicePort extends DefaultBookingServicePort {
  constructor(repository: BookingRepositoryPort) {
    super(repository);
  }
}
