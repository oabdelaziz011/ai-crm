import type { SupabaseClient } from "@supabase/supabase-js";
import type { SchedulingToolPorts } from "@workspace/ai-tool-router";
import {
  executeCancelBooking,
  executeCheckInBooking,
  executeCheckOutBooking,
  executeCreateBooking,
  executeRescheduleBooking,
  executeSearchBookings,
  type BookingDomainServicePort,
} from "@workspace/ai-tool-router";
import { supabase } from "@/lib/supabase";
import { getBookingDomainServices } from "@/lib/scheduling/booking-domain";
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

export type CreateApplicationLayerSchedulingToolPortsDeps = {
  /** Test injection — production uses login-app supabase client. */
  client?: SupabaseClient;
  /** Test injection — production uses getBookingDomainServices().bookingDomain. */
  bookingDomain?: BookingDomainServicePort;
};

/** Scheduling AI tools — availability/create via Application Layer; search/reschedule/cancel/check-in/out via shared ownership-hardened domain ports. */
export function createApplicationLayerSchedulingToolPorts(
  portContext: LoginAppPortContext,
  deps: CreateApplicationLayerSchedulingToolPortsDeps = {},
): SchedulingToolPorts {
  const services = createLoginAppApplicationServices(portContext);
  const client = deps.client ?? supabase;
  const bookingDomain = deps.bookingDomain ?? getBookingDomainServices().bookingDomain;

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
      return unwrapQuery(result) as Awaited<ReturnType<SchedulingToolPorts["searchAvailability"]>>;
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
      const result = await executeCreateBooking(bookingDomain, {
        ...input,
        companyId: portContext.companyId,
      });
      if (result.success && input.conversationId && input.customerId) {
        await client
          .from("conversations")
          .update({ customer_id: input.customerId })
          .eq("id", input.conversationId)
          .eq("company_id", portContext.companyId)
          .is("customer_id", null);
      }
      return result;
    },

    async searchBookings(input) {
      return executeSearchBookings(client, {
        ...input,
        companyId: portContext.companyId,
      });
    },

    async rescheduleBooking(input) {
      return executeRescheduleBooking(client, bookingDomain, {
        ...input,
        companyId: portContext.companyId,
      });
    },

    async cancelBooking(input) {
      return executeCancelBooking(client, bookingDomain, {
        ...input,
        companyId: portContext.companyId,
      });
    },

    /**
     * Phase 5L — reuse shared ownership boundary (company + trustedCustomerId)
     * identical to webhook / Phase 5H executeCheckInBooking.
     */
    async checkInBooking(input) {
      return executeCheckInBooking(client, bookingDomain, {
        ...input,
        companyId: portContext.companyId,
      });
    },

    /**
     * Phase 5L — reuse shared ownership boundary (company + trustedCustomerId)
     * identical to webhook / Phase 5H executeCheckOutBooking → completeBooking.
     */
    async checkOutBooking(input) {
      return executeCheckOutBooking(client, bookingDomain, {
        ...input,
        companyId: portContext.companyId,
      });
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
