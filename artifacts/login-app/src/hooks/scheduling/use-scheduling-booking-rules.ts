import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { invalidateAllBookingSlotQueries } from "@/lib/booking/invalidate-booking-queries";
import { getSchedulingServices } from "@/lib/scheduling";
import type { BookingRulesFormValues } from "@/lib/scheduling/validation/schemas";

const services = getSchedulingServices();

export const SCHEDULING_BOOKING_RULES_KEY = ["scheduling", "booking-rules"] as const;

export function schedulingBookingRulesKey(companyId: string | null) {
  return [...SCHEDULING_BOOKING_RULES_KEY, companyId] as const;
}

async function requireUserId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export function useSchedulingBookingRules(companyId: string | null) {
  return useQuery({
    queryKey: schedulingBookingRulesKey(companyId),
    enabled: Boolean(companyId),
    queryFn: () => services.bookingRules.getOrDefaults(companyId!),
  });
}

export function useSaveSchedulingBookingRules(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: BookingRulesFormValues) => {
      if (!companyId) throw new Error("Company required");
      const userId = await requireUserId();
      return services.bookingRules.save(companyId, userId, values);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: schedulingBookingRulesKey(companyId) });
      invalidateAllBookingSlotQueries(qc, companyId);
    },
  });
}
