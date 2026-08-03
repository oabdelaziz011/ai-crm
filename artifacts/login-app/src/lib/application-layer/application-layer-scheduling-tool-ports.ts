import type { SchedulingToolPorts } from "@workspace/ai-tool-router";
import type { LoginAppPortContext } from "./adapters/customer-read-port-adapter.js";
import {
  buildToolApplicationContext,
  createLoginAppApplicationServices,
  unwrapCommand,
  unwrapQuery,
} from "./application-layer-tool-context.js";

function composeScheduledAt(date: string, slotStart: string): string {
  const normalized = slotStart.length <= 5 ? `${date}T${slotStart}:00` : `${date}T${slotStart}`;
  return new Date(normalized).toISOString();
}

/** Scheduling AI tools — all operations route through BookingApplicationService. */
export function createApplicationLayerSchedulingToolPorts(
  portContext: LoginAppPortContext,
): SchedulingToolPorts {
  const services = createLoginAppApplicationServices(portContext);

  return {
    async searchAvailability(input) {
      const ctx = buildToolApplicationContext(portContext, input.userId);
      const result = await services.booking.searchAvailability(
        {
          tenantId: input.companyId,
          actorUserId: input.userId,
          serviceId: input.serviceId,
          resourceId: input.resourceId,
          branchId: input.branchId,
          date: input.date,
          daysAhead: input.daysAhead,
        },
        ctx,
      );
      return unwrapQuery(result);
    },

    async findNextAvailable(input) {
      const ctx = buildToolApplicationContext(portContext, input.userId);
      const result = await services.booking.findNextAvailable(
        {
          tenantId: input.companyId,
          actorUserId: input.userId,
          serviceId: input.serviceId,
          resourceId: input.resourceId,
          branchId: input.branchId,
          daysAhead: input.daysAhead,
        },
        ctx,
      );
      return unwrapQuery(result);
    },

    async recommendAppointment(input) {
      const ctx = buildToolApplicationContext(portContext, input.userId);
      const result = await services.booking.recommendAppointment(
        {
          tenantId: input.companyId,
          actorUserId: input.userId,
          serviceId: input.serviceId,
          preferredResourceId: input.preferredResourceId,
          preferredBranchId: input.preferredBranchId,
          preferredDate: input.preferredDate,
          preferredTime: input.preferredTime,
          daysAhead: input.daysAhead,
        },
        ctx,
      );
      return unwrapQuery(result) as never;
    },

    async createBooking(input) {
      const ctx = buildToolApplicationContext(portContext, input.userId);
      try {
        const result = await services.booking.createBooking(
          {
            customerId: input.customerId,
            scheduledAt: composeScheduledAt(input.date, input.slotStart),
            serviceId: input.serviceId,
            employeeId: input.resourceId,
          },
          ctx,
        );
        const booking = unwrapCommand(result);
        return {
          success: true,
          bookingId: booking.bookingId,
          status: booking.status,
          startAt: booking.scheduledAt,
          endAt: booking.scheduledAt,
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : "Booking could not be created.",
          errors: ["BOOKING_FAILED"],
        };
      }
    },

    async searchBookings(input) {
      const ctx = buildToolApplicationContext(portContext, input.userId);
      try {
        const result = await services.booking.searchBookings(
          { customerId: input.customerId, daysBack: input.daysBack },
          ctx,
        );
        const data = unwrapQuery(result);
        return {
          success: true,
          bookings: data.bookings.map((booking) => ({
            bookingId: booking.id,
            customerId: booking.customerId,
            customerName: booking.customerName,
            reference: booking.reference,
            scheduledAt: booking.scheduledAt,
            status: booking.status,
            employeeName: booking.employeeName,
            serviceName: booking.serviceName,
          })),
          total: data.total,
        };
      } catch (error) {
        return {
          success: false,
          bookings: [],
          total: 0,
          message: error instanceof Error ? error.message : "Bookings could not be searched.",
        };
      }
    },

    async rescheduleBooking(input) {
      const ctx = buildToolApplicationContext(portContext, input.userId);
      try {
        const result = await services.booking.rescheduleBooking(
          {
            bookingId: input.bookingId,
            newScheduledAt: composeScheduledAt(input.date, input.slotStart),
            reason: input.reason,
          },
          ctx,
        );
        const booking = unwrapCommand(result);
        return {
          success: true,
          bookingId: booking.bookingId,
          scheduledAt: booking.scheduledAt,
          rescheduledAt: booking.rescheduledAt,
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : "Booking could not be rescheduled.",
          errors: ["RESCHEDULE_FAILED"],
        };
      }
    },

    async cancelBooking(input) {
      const ctx = buildToolApplicationContext(portContext, input.userId);
      try {
        const result = await services.booking.cancelBooking(
          { bookingId: input.bookingId, reason: input.reason },
          ctx,
        );
        const booking = unwrapCommand(result);
        return {
          success: true,
          bookingId: booking.bookingId,
          cancelledAt: booking.cancelledAt,
          status: booking.status,
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : "Booking could not be cancelled.",
          errors: ["CANCEL_FAILED"],
        };
      }
    },

    async checkInBooking(input) {
      const ctx = buildToolApplicationContext(portContext, input.userId);
      try {
        const result = await services.booking.checkInBooking(
          { bookingId: input.bookingId, roomId: input.roomId },
          ctx,
        );
        const booking = unwrapCommand(result);
        return {
          success: true,
          bookingId: booking.bookingId,
          checkedInAt: booking.checkedInAt,
          status: booking.status,
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : "Booking could not be checked in.",
          errors: ["CHECK_IN_FAILED"],
        };
      }
    },

    async checkOutBooking(input) {
      const ctx = buildToolApplicationContext(portContext, input.userId);
      try {
        const result = await services.booking.checkOutBooking({ bookingId: input.bookingId }, ctx);
        const booking = unwrapCommand(result);
        return {
          success: true,
          bookingId: booking.bookingId,
          checkedOutAt: booking.checkedOutAt,
          status: booking.status,
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : "Booking could not be checked out.",
          errors: ["CHECK_OUT_FAILED"],
        };
      }
    },
  };
}

export async function rescheduleBookingViaApplicationLayer(
  portContext: LoginAppPortContext,
  input: { userId: string; bookingId: string; date: string; slotStart: string },
) {
  const services = createLoginAppApplicationServices(portContext);
  const ctx = buildToolApplicationContext(portContext, input.userId);
  const result = await services.booking.rescheduleBooking(
    {
      bookingId: input.bookingId,
      newScheduledAt: composeScheduledAt(input.date, input.slotStart),
    },
    ctx,
  );
  return unwrapCommand(result);
}

export async function cancelBookingViaApplicationLayer(
  portContext: LoginAppPortContext,
  input: { userId: string; bookingId: string; reason?: string },
) {
  const services = createLoginAppApplicationServices(portContext);
  const ctx = buildToolApplicationContext(portContext, input.userId);
  const result = await services.booking.cancelBooking(
    { bookingId: input.bookingId, reason: input.reason },
    ctx,
  );
  return unwrapCommand(result);
}

export async function checkInBookingViaApplicationLayer(
  portContext: LoginAppPortContext,
  input: { userId: string; bookingId: string; roomId?: string },
) {
  const services = createLoginAppApplicationServices(portContext);
  const ctx = buildToolApplicationContext(portContext, input.userId);
  const result = await services.booking.checkInBooking(
    { bookingId: input.bookingId, roomId: input.roomId },
    ctx,
  );
  return unwrapCommand(result);
}

export async function checkOutBookingViaApplicationLayer(
  portContext: LoginAppPortContext,
  input: { userId: string; bookingId: string },
) {
  const services = createLoginAppApplicationServices(portContext);
  const ctx = buildToolApplicationContext(portContext, input.userId);
  const result = await services.booking.checkOutBooking({ bookingId: input.bookingId }, ctx);
  return unwrapCommand(result);
}

export async function searchBookingsViaApplicationLayer(
  portContext: LoginAppPortContext,
  input: { userId: string; customerId?: string; daysBack?: number },
) {
  const services = createLoginAppApplicationServices(portContext);
  const ctx = buildToolApplicationContext(portContext, input.userId);
  const result = await services.booking.searchBookings(
    { customerId: input.customerId, daysBack: input.daysBack },
    ctx,
  );
  return unwrapQuery(result);
}
