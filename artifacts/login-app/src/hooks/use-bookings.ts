import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { BookingListService } from "@/lib/booking/booking-list-service";
import { invalidateBookingQueries } from "@/lib/booking/invalidate-booking-queries";
import { bookingsListKey } from "@/lib/booking/booking-query-keys";
import { useAuth } from "@/context/auth-context";
import type { Booking, BookingUpdate } from "@/lib/types";
import {
  useCreateDomainBooking,
  useRescheduleDomainBooking,
  useCancelDomainBooking,
  useCompleteDomainBooking,
  useAvailableBookingSlots,
  useValidateDomainBooking,
  formatBookingDomainError,
} from "@/hooks/use-booking-domain";

export const BOOKINGS_KEY = ["bookings"] as const;

export function useBookings() {
  const { profile, user } = useAuth();
  const companyId = profile?.company_id ?? null;

  return useQuery({
    queryKey: bookingsListKey(companyId),
    enabled: Boolean(user && companyId),
    queryFn: async (): Promise<Booking[]> => {
      if (!companyId || !user) return [];
      const service = new BookingListService(supabase);
      return service.listForCompany(companyId, user.id);
    },
  });
}

export function useUpdateBooking() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: BookingUpdate }) => {
      const { data, error } = await supabase
        .from("bookings")
        .update(values)
        .eq("id", id)
        .select("*, customers(id, name)")
        .single();
      if (error) throw new Error(error.message);
      return data as Booking;
    },
    onSuccess: (booking) => {
      invalidateBookingQueries(qc, {
        companyId,
        customerId: booking.customer_id,
      });
    },
  });
}

export function useCreateBooking(companyId?: string | null) {
  const { profile } = useAuth();
  return useCreateDomainBooking(companyId ?? profile?.company_id ?? null);
}

export function useRescheduleBooking(companyId?: string | null) {
  const { profile } = useAuth();
  return useRescheduleDomainBooking(companyId ?? profile?.company_id ?? null);
}

export {
  useCancelDomainBooking,
  useCompleteDomainBooking,
  useAvailableBookingSlots,
  useValidateDomainBooking,
  formatBookingDomainError,
};

export function useDeleteBooking() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const cancelDomain = useCancelDomainBooking(companyId);

  return useMutation({
    mutationFn: async (payload: {
      id: string;
      isSchedulingBooking?: boolean;
      customerId?: string | null;
    }) => {
      if (payload.isSchedulingBooking) {
        await cancelDomain.mutateAsync({
          bookingId: payload.id,
          customerId: payload.customerId,
        });
        return;
      }

      const { error } = await supabase.from("bookings").delete().eq("id", payload.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_result, variables) => {
      invalidateBookingQueries(qc, {
        companyId,
        customerId: variables.customerId,
      });
    },
  });
}
