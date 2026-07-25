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

  it("finds a booking by booking id", async () => {
    const repository = new InMemoryBookingRepository();
    const service = new BookingService(repository);
    const created = await service.createBooking({
      companyId: "company-1",
      userId: "user-1",
      service: "Consultation",
      doctorId: "dr_smith",
      locationId: "main",
      appointmentDate: "2026-07-21",
      appointmentTime: "10:30",
      customerId: "cust-1",
    });

    const found = await service.findBooking({
      companyId: "company-1",
      userId: "user-1",
      lookupBy: "booking_id",
      lookupValue: created.bookingId,
    });

    assert.equal(found.status, "found");
  });

  it("updates and cancels a booking", async () => {
    const repository = new InMemoryBookingRepository();
    const service = new BookingService(repository);
    const created = await service.createBooking({
      companyId: "company-1",
      userId: "user-1",
      service: "Consultation",
      doctorId: "dr_smith",
      locationId: "main",
      appointmentDate: "2026-07-21",
      appointmentTime: "10:30",
      customerId: "cust-1",
    });

    const updated = await service.updateBooking({
      companyId: "company-1",
      userId: "user-1",
      bookingId: created.bookingId,
      field: "notes",
      value: "Updated note",
    });
    assert.equal(updated.booking.notes, "Updated note");

    const cancelled = await service.cancelBooking({
      companyId: "company-1",
      userId: "user-1",
      bookingId: created.bookingId,
    });
    assert.equal(cancelled.booking.status, "Cancelled");
  });
});
