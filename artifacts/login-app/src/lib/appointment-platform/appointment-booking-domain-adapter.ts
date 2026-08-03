import type { BookingDomainServicePort } from "@workspace/ai-tool-router";
import type { AppointmentCommandService } from "@workspace/appointment-platform";

/** Backward-compatible adapter: AI create_booking routes through AppointmentCommandService. */
export function createAppointmentBookingDomainAdapter(
  commands: AppointmentCommandService,
): BookingDomainServicePort {
  return {
    async createBooking(input) {
      const result = await commands.createAppointment(
        {
          userId: input.createdBy ?? null,
          companyId: input.companyId,
          isSuperAdmin: false,
          hasPermission: () => true,
        },
        {
          companyId: input.companyId,
          customerId: input.customerId,
          resourceId: input.resourceId,
          serviceId: input.serviceId,
          date: input.date,
          slotStart: input.slotStart,
          source: input.source,
          notes: input.notes ?? undefined,
          branchId: input.branchId ?? undefined,
        },
      );

      const appointment = result.appointment;
      return {
        booking: {
          id: appointment.id,
          status: appointment.status,
          start_at: appointment.startAt,
          end_at: appointment.endAt,
          company_id: appointment.companyId,
        },
      };
    },
  };
}
