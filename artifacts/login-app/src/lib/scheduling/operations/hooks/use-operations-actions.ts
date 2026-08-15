import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { getBookingDomainServices } from "@/lib/scheduling/booking-domain";
import { formatBookingDomainError } from "@/lib/booking/booking-view-adapter";
import { invalidateOperationsQueries } from "@/lib/scheduling/operations/cache";
import type { CancelBookingWithReasonInput } from "@/lib/scheduling/operations/types";
import { CallService } from "@/lib/customer-profile/services/call-service";
import { ConversationService } from "@/lib/customer-profile/services/conversation-service";
import type { OperationsBookingView } from "@/lib/scheduling/operations/types";

const bookingDomain = getBookingDomainServices();

async function requireAuth(): Promise<{ userId: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { userId: user.id };
}

export function useCheckInDomainBooking(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { bookingId: string; customerId?: string | null }) => {
      if (!companyId) throw new Error("Company required");
      const { userId } = await requireAuth();
      const result = await bookingDomain.bookingDomain.checkInBooking({
        companyId,
        bookingId: input.bookingId,
        updatedBy: userId,
      });
      return result.booking;
    },
    onSuccess: (booking, variables) => {
      invalidateOperationsQueries(qc, {
        companyId,
        customerId: variables.customerId ?? booking.customer_id,
      });
    },
  });
}

export function useCancelBookingWithReason(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CancelBookingWithReasonInput) => {
      if (!companyId) throw new Error("Company required");
      const { userId } = await requireAuth();
      const result = await bookingDomain.bookingDomain.cancelBooking({
        companyId,
        bookingId: input.bookingId,
        updatedBy: userId,
        reason: input.reason,
        notes: input.notes,
      });
      return result.booking;
    },
    onSuccess: (booking, variables) => {
      invalidateOperationsQueries(qc, {
        companyId,
        customerId: variables.customerId ?? booking.customer_id,
      });
    },
  });
}

export function useOperationsContactActions(companyId: string | null) {
  const [, setLocation] = useLocation();

  const callCustomer = (phone: string | null | undefined) => {
    if (!phone) throw new Error("CUSTOMER_PHONE_MISSING");
    CallService.initiateCall(phone);
  };

  const openWhatsapp = async (booking: OperationsBookingView, onClose?: () => void) => {
    if (!companyId || !booking.customerId) return;
    await ConversationService.openWhatsappConversation({
      customerId: booking.customerId,
      companyId,
      phone: booking.customer?.phone,
      navigate: setLocation,
      onCloseProfile: onClose,
    });
  };

  return { callCustomer, openWhatsapp };
}

export { formatBookingDomainError };
