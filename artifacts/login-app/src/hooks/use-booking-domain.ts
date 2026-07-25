import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { getBookingDomainServices } from "@/lib/scheduling/booking-domain";
import { getSchedulingServices } from "@/lib/scheduling";
import { BookingListService } from "@/lib/booking/booking-list-service";
import {
  formatBookingDomainError,
} from "@/lib/booking/booking-view-adapter";
import { invalidateBookingQueries } from "@/lib/booking/invalidate-booking-queries";
import {
  bookingsListKey,
  bookingSlotsKey,
} from "@/lib/booking/booking-query-keys";
import type {
  CreateBookingInput,
  RescheduleBookingInput,
} from "@/lib/scheduling/booking-domain";
import type { BookingModalPrefill } from "@/lib/customer-profile/services/booking-profile-service";

const bookingDomain = getBookingDomainServices();
const scheduling = getSchedulingServices();

async function requireAuth(): Promise<{ userId: string; companyId: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return { userId: user.id, companyId: profile?.company_id ?? null };
}

export function useAvailableBookingSlots(
  companyId: string | null,
  resourceId: string | null,
  serviceId: string | null,
  date: string | null,
) {
  return useQuery({
    queryKey: bookingSlotsKey(companyId, resourceId, serviceId, date),
    enabled: Boolean(companyId && resourceId && serviceId && date),
    staleTime: 30_000,
    queryFn: () =>
      scheduling.slotGenerationEngine.getAvailableSlots(
        companyId!,
        resourceId!,
        serviceId!,
        date!,
        { respectBookingRules: true },
      ),
  });
}

export function useCreateDomainBooking(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Omit<CreateBookingInput, "companyId" | "source"> & {
        source?: CreateBookingInput["source"];
      },
    ) => {
      if (!companyId) throw new Error("Company required");
      const { userId } = await requireAuth();
      const result = await bookingDomain.bookingDomain.createBooking({
        companyId,
        customerId: input.customerId,
        resourceId: input.resourceId,
        serviceId: input.serviceId,
        date: input.date,
        slotStart: input.slotStart,
        source: input.source ?? "crm",
        notes: input.notes,
        createdBy: userId,
        branchId: input.branchId,
      });
      return result.booking;
    },
    onSuccess: (booking) => {
      invalidateBookingQueries(qc, {
        companyId,
        customerId: booking.customer_id,
        resourceId: booking.resource_id,
        serviceId: booking.service_id,
      });
    },
  });
}

export function useCancelDomainBooking(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { bookingId: string; customerId?: string | null }) => {
      if (!companyId) throw new Error("Company required");
      const { userId } = await requireAuth();
      const result = await bookingDomain.bookingDomain.cancelBooking({
        companyId,
        bookingId: input.bookingId,
        updatedBy: userId,
      });
      return result.booking;
    },
    onSuccess: (booking, variables) => {
      invalidateBookingQueries(qc, {
        companyId,
        customerId: variables.customerId ?? booking.customer_id,
        resourceId: booking.resource_id,
        serviceId: booking.service_id,
      });
    },
  });
}

export function useRescheduleDomainBooking(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Omit<RescheduleBookingInput, "companyId"> & { customerId?: string | null },
    ) => {
      if (!companyId) throw new Error("Company required");
      const { userId } = await requireAuth();
      const result = await bookingDomain.bookingDomain.rescheduleBooking({
        companyId,
        bookingId: input.bookingId,
        date: input.date,
        slotStart: input.slotStart,
        updatedBy: userId,
      });
      return result;
    },
    onSuccess: ({ booking, previousBooking }) => {
      invalidateBookingQueries(qc, {
        companyId,
        customerId: booking.customer_id,
        resourceId: booking.resource_id,
        serviceId: booking.service_id,
        date: previousBooking.start_at.slice(0, 10),
      });
      invalidateBookingQueries(qc, {
        companyId,
        customerId: booking.customer_id,
        resourceId: booking.resource_id,
        serviceId: booking.service_id,
        date: booking.start_at.slice(0, 10),
      });
    },
  });
}

export function useCompleteDomainBooking(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { bookingId: string; customerId?: string | null }) => {
      if (!companyId) throw new Error("Company required");
      const { userId } = await requireAuth();
      return bookingDomain.bookingDomain.completeBooking({
        companyId,
        bookingId: input.bookingId,
        updatedBy: userId,
      });
    },
    onSuccess: ({ booking }, variables) => {
      invalidateBookingQueries(qc, {
        companyId,
        customerId: variables.customerId ?? booking.customer_id,
      });
    },
  });
}

export function useValidateDomainBooking(companyId: string | null) {
  return useMutation({
    mutationFn: async (
      input: Omit<CreateBookingInput, "companyId" | "source">,
    ) => {
      if (!companyId) throw new Error("Company required");
      return bookingDomain.bookingDomain.validateBooking({
        companyId,
        customerId: input.customerId,
        resourceId: input.resourceId,
        serviceId: input.serviceId,
        date: input.date,
        slotStart: input.slotStart,
      });
    },
  });
}

export { formatBookingDomainError };

export type CreateBookingFormPrefill = BookingModalPrefill;
