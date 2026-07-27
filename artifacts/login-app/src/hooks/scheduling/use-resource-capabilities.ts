import { useMemo } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
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

export async function syncResourceServicesFor(
  companyId: string,
  resourceId: string,
  serviceIds: string[],
) {
  const userId = await requireUserId();
  return services.capabilities.syncResourceServices(resourceId, companyId, userId, serviceIds);
}

export async function syncServiceResourcesFor(
  companyId: string,
  serviceId: string,
  resourceIds: string[],
) {
  const userId = await requireUserId();
  return services.capabilities.syncServiceResources(serviceId, companyId, userId, resourceIds);
}

export function useResourceServiceCounts(
  companyId: string | null,
  resourceIds: string[],
) {
  const queries = useQueries({
    queries: resourceIds.map((resourceId) => ({
      queryKey: schedulingResourceCapabilitiesKey(companyId, resourceId),
      queryFn: () => services.capabilities.listServicesForResource(resourceId, companyId!),
      enabled: Boolean(companyId && resourceId),
      staleTime: 30_000,
    })),
  });

  return useMemo(() => {
    const counts = new Map<string, number>();
    resourceIds.forEach((resourceId, index) => {
      counts.set(resourceId, queries[index]?.data?.length ?? 0);
    });
    return {
      counts,
      isLoading: queries.some((query) => query.isLoading),
    };
  }, [queries, resourceIds]);
}

export function invalidateCapabilityQueries(qc: ReturnType<typeof useQueryClient>, companyId: string | null) {
  void qc.invalidateQueries({ queryKey: SCHEDULING_CAPABILITIES_KEY });
  invalidateAllBookingSlotQueries(qc, companyId);
}
