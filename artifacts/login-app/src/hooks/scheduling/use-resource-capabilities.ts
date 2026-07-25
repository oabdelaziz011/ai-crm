import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { invalidateAllBookingSlotQueries } from "@/lib/booking/invalidate-booking-queries";
import { getSchedulingServices } from "@/lib/scheduling";
import {
  SCHEDULING_CAPABILITIES_KEY,
  schedulingResourceCapabilitiesKey,
  schedulingServiceResourcesKey,
} from "@/hooks/scheduling/keys";

const services = getSchedulingServices();

async function requireUserId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export function useResourceCapabilities(companyId: string | null, resourceId: string | null) {
  return useQuery({
    queryKey: schedulingResourceCapabilitiesKey(companyId, resourceId),
    enabled: Boolean(companyId && resourceId),
    queryFn: () => services.capabilities.listServicesForResource(resourceId!, companyId!),
  });
}

export function useServiceResources(
  companyId: string | null,
  serviceId: string | null,
  branchId?: string | null,
) {
  return useQuery({
    queryKey: [...schedulingServiceResourcesKey(companyId, serviceId), branchId ?? null] as const,
    enabled: Boolean(companyId && serviceId),
    queryFn: () =>
      services.capabilities.listResourcesForService(serviceId!, companyId!, {
        branchId: branchId ?? null,
      }),
  });
}

export function useSyncResourceServices(
  companyId: string | null,
  resourceId: string | null,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (serviceIds: string[]) => {
      if (!companyId || !resourceId) throw new Error("Resource required");
      const userId = await requireUserId();
      return services.capabilities.syncResourceServices(
        resourceId,
        companyId,
        userId,
        serviceIds,
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SCHEDULING_CAPABILITIES_KEY });
      invalidateAllBookingSlotQueries(qc, companyId);
    },
  });
}

export function useSyncServiceResources(
  companyId: string | null,
  serviceId: string | null,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (resourceIds: string[]) => {
      if (!companyId || !serviceId) throw new Error("Service required");
      const userId = await requireUserId();
      return services.capabilities.syncServiceResources(
        serviceId,
        companyId,
        userId,
        resourceIds,
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SCHEDULING_CAPABILITIES_KEY });
      invalidateAllBookingSlotQueries(qc, companyId);
    },
  });
}
