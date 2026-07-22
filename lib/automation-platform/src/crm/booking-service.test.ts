import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BookingService } from "./booking-service.js";
import { InMemoryBookingRepository } from "./booking-repository-port.js";

describe("BookingService", () => {
  it("creates a booking when the slot is available", async () => {
    const repository = new InMemoryBookingRepository();
    const service = new BookingService(repository);

    const result = await service.createBooking({
      companyId: "company-1",
      userId: "user-1",
      service: "Consultation",
      doctorId: "dr_smith",
      locationId: "main",
      appointmentDate: "2026-07-21",
      appointmentTime: "10:30",
      customerId: "cust-1",
      durationMinutes: 30,
      notes: "First visit",
    });

    assert.ok(result.bookingId);
    assert.ok(result.bookingDate);
    assert.equal(repository.list().length, 1);
  });

  it("rejects double booking for the same doctor and slot", async () => {
    const repository = new InMemoryBookingRepository();
    const service = new BookingService(repository);
    const input = {
      companyId: "company-1",
      userId: "user-1",
      service: "Consultation",
      doctorId: "dr_smith",
      locationId: "main",
      appointmentDate: "2026-07-21",
      appointmentTime: "10:30",
      customerId: "cust-1",
    };

    await service.createBooking(input);
    await assert.rejects(() => service.createBooking({ ...input, customerId: "cust-2" }));
  });
});
