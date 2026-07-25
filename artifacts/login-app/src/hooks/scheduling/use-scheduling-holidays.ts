import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { invalidateAllBookingSlotQueries } from "@/lib/booking/invalidate-booking-queries";
import { getSchedulingServices } from "@/lib/scheduling";
import type { HolidayFormValues } from "@/lib/scheduling/validation/schemas";

const services = getSchedulingServices();

export const SCHEDULING_HOLIDAYS_KEY = ["scheduling", "holidays"] as const;

export function schedulingHolidaysKey(companyId: string | null) {
  return [...SCHEDULING_HOLIDAYS_KEY, companyId] as const;
}

async function requireUserId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export function useSchedulingHolidays(companyId: string | null) {
  return useQuery({
    queryKey: schedulingHolidaysKey(companyId),
    enabled: Boolean(companyId),
    queryFn: () => services.holidays.list(companyId!),
  });
}

export function useCreateSchedulingHoliday(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: HolidayFormValues) => {
      if (!companyId) throw new Error("Company required");
      const userId = await requireUserId();
      return services.holidays.create(companyId, userId, values);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: schedulingHolidaysKey(companyId) });
      invalidateAllBookingSlotQueries(qc, companyId);
    },
  });
}

export function useUpdateSchedulingHoliday(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: HolidayFormValues }) => {
      if (!companyId) throw new Error("Company required");
      const userId = await requireUserId();
      return services.holidays.update(id, companyId, userId, values);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: schedulingHolidaysKey(companyId) });
      invalidateAllBookingSlotQueries(qc, companyId);
    },
  });
}

export function useDeleteSchedulingHoliday(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Company required");
      await services.holidays.delete(id, companyId);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: schedulingHolidaysKey(companyId) });
      invalidateAllBookingSlotQueries(qc, companyId);
    },
  });
}
