import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingWritePort, BookingReadModel } from "@workspace/application-layer";
import { getBookingDomainServices } from "@/lib/scheduling/booking-domain";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";

function mapDomainBooking(
  booking: {
    id: string;
    customer_id: string;
    start_at: string;
    status: string;
    resource_id?: string | null;
  },
  tenantId: string,
  extras?: Partial<BookingReadModel>,
): BookingReadModel {
  return Object.freeze({
    id: booking.id,
    tenantId,
    customerId: booking.customer_id,
    customerName: extras?.customerName ?? "Customer",
    reference: booking.id.slice(0, 8).toUpperCase(),
    scheduledAt: booking.start_at,
    status: booking.status,
    paymentStatus: extras?.paymentStatus ?? "Unpaid",
    employeeId: booking.resource_id ?? undefined,
    employeeName: extras?.employeeName,
    roomId: extras?.roomId,
    serviceName: extras?.serviceName,
  });
}

export function createLoginAppBookingWritePort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): BookingWritePort {
  const { bookingDomain } = getBookingDomainServices();

  return {
    async create(input) {
      if (input.tenantId !== ctx.companyId || !ctx.hasPermission("bookings.create")) {
        throw new Error("Permission denied");
      }
      const scheduled = new Date(input.scheduledAt);
      const result = await bookingDomain.createBooking({
        companyId: input.tenantId,
        customerId: input.customerId,
        resourceId: input.employeeId ?? "",
        serviceId: input.serviceId ?? "",
        date: scheduled.toISOString().slice(0, 10),
        slotStart: scheduled.toISOString(),
        source: "crm",
        createdBy: ctx.actorUserId,
        branchId: null,
      });
      return mapDomainBooking(result.booking, input.tenantId, { paymentStatus: "Unpaid" });
    },

    async reschedule(tenantId, bookingId, scheduledAt) {
      if (tenantId !== ctx.companyId || !ctx.hasPermission("bookings.edit")) {
        throw new Error("Permission denied");
      }
      const scheduled = new Date(scheduledAt);
      const result = await bookingDomain.rescheduleBooking({
        companyId: tenantId,
        bookingId,
        date: scheduled.toISOString().slice(0, 10),
        slotStart: scheduled.toISOString(),
        updatedBy: ctx.actorUserId,
      });
      return mapDomainBooking(result.booking, tenantId);
    },

    async cancel(tenantId, bookingId, reason) {
      if (tenantId !== ctx.companyId || !ctx.hasPermission("bookings.edit")) {
        throw new Error("Permission denied");
      }
      const result = await bookingDomain.cancelBooking({
        companyId: tenantId,
        bookingId,
        updatedBy: ctx.actorUserId,
        reason: reason ?? null,
        notes: null,
      });
      return mapDomainBooking(result.booking, tenantId, { paymentStatus: "Unpaid" });
    },

    async checkIn(tenantId, bookingId, roomId) {
      if (tenantId !== ctx.companyId || !ctx.hasPermission("bookings.edit")) {
        throw new Error("Permission denied");
      }
      const result = await bookingDomain.checkInBooking({
        companyId: tenantId,
        bookingId,
        updatedBy: ctx.actorUserId,
      });
      return mapDomainBooking(result.booking, tenantId, { roomId: roomId ?? undefined });
    },

    async checkOut(tenantId, bookingId) {
      if (tenantId !== ctx.companyId || !ctx.hasPermission("bookings.edit")) {
        throw new Error("Permission denied");
      }
      const result = await bookingDomain.completeBooking({
        companyId: tenantId,
        bookingId,
        updatedBy: ctx.actorUserId,
      });
      return mapDomainBooking(result.booking, tenantId, { paymentStatus: "Paid" });
    },

    async markNoShow(tenantId, bookingId, gracePeriodMinutes) {
      if (tenantId !== ctx.companyId || !ctx.hasPermission("bookings.edit")) {
        throw new Error("Permission denied");
      }
      const result = await bookingDomain.markNoShowBooking({
        companyId: tenantId,
        bookingId,
        updatedBy: ctx.actorUserId,
        gracePeriodMinutes,
      });
      return mapDomainBooking(result.booking, tenantId);
    },

    async assignEmployee(tenantId, bookingId, employeeId) {
      if (tenantId !== ctx.companyId || !ctx.hasPermission("bookings.edit")) {
        throw new Error("Permission denied");
      }

      const { data, error } = await client
        .from("scheduling_bookings")
        .update({ resource_id: employeeId, updated_by: ctx.actorUserId })
        .eq("company_id", tenantId)
        .eq("id", bookingId)
        .select("id, customer_id, start_at, status, resource_id")
        .single();

      if (error) throw new Error(error.message);
      return mapDomainBooking(data, tenantId, { employeeId });
    },

    async transitionClinicStatus(tenantId, bookingId, status) {
      if (tenantId !== ctx.companyId || !ctx.hasPermission("bookings.edit")) {
        throw new Error("Permission denied");
      }
      const result =
        status === "with_nurse"
          ? await bookingDomain.sendToNurse({
              companyId: tenantId,
              bookingId,
              updatedBy: ctx.actorUserId,
            })
          : status === "in_progress"
            ? await bookingDomain.sendToDoctor({
                companyId: tenantId,
                bookingId,
                updatedBy: ctx.actorUserId,
              })
            : await bookingDomain.archiveBooking({
                companyId: tenantId,
                bookingId,
                updatedBy: ctx.actorUserId,
              });
      return mapDomainBooking(result.booking, tenantId);
    },

    async completeTriage(tenantId, bookingId) {
      if (tenantId !== ctx.companyId || !ctx.hasPermission("bookings.edit")) {
        throw new Error("Permission denied");
      }
      const result = await bookingDomain.completeTriage({
        companyId: tenantId,
        bookingId,
        updatedBy: ctx.actorUserId,
      });
      return mapDomainBooking(result.booking, tenantId);
    },
  };
}
