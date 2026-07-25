import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { invalidateAllBookingSlotQueries } from "@/lib/booking/invalidate-booking-queries";
import { getSchedulingServices } from "@/lib/scheduling";
import type {
  ExceptionFormValues,
  WeeklyScheduleFormValues,
} from "@/lib/scheduling/validation/schemas";

const services = getSchedulingServices();

export const SCHEDULING_AVAILABILITY_KEY = ["scheduling", "availability"] as const;

export function schedulingAvailabilityKey(
  companyId: string | null,
  resourceId: string | null,
) {
  return [...SCHEDULING_AVAILABILITY_KEY, companyId, resourceId] as const;
}

async function requireUserId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export function useResourceAvailability(
  companyId: string | null,
  resourceId: string | null,
) {
  return useQuery({
    queryKey: schedulingAvailabilityKey(companyId, resourceId),
    enabled: Boolean(companyId && resourceId),
    queryFn: () => services.availability.getConfig(resourceId!, companyId!),
  });
}

export function useSaveWeeklySchedule(companyId: string | null, resourceId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: WeeklyScheduleFormValues) => {
      if (!companyId || !resourceId) throw new Error("Resource required");
      return services.availability.saveWeeklySchedule(resourceId, companyId, values);
    },
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: schedulingAvailabilityKey(companyId, resourceId),
      });
      invalidateAllBookingSlotQueries(qc, companyId);
    },
  });
}

export function useCreateAvailabilityException(
  companyId: string | null,
  resourceId: string | null,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: ExceptionFormValues) => {
      if (!companyId || !resourceId) throw new Error("Resource required");
      const userId = await requireUserId();
      return services.availability.createException(resourceId, companyId, userId, values);
    },
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: schedulingAvailabilityKey(companyId, resourceId),
      });
      invalidateAllBookingSlotQueries(qc, companyId);
    },
  });
}

export function useDeleteAvailabilityException(
  companyId: string | null,
  resourceId: string | null,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (exceptionId: string) => {
      if (!companyId) throw new Error("Company required");
      await services.availability.deleteException(exceptionId, companyId);
    },
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: schedulingAvailabilityKey(companyId, resourceId),
      });
      invalidateAllBookingSlotQueries(qc, companyId);
    },
  });
}
