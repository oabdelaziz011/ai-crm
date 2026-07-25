import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { getSchedulingServices } from "@/lib/scheduling";
import type { ServiceFormValues } from "@/lib/scheduling/validation/service-schemas";
import {
  SCHEDULING_CAPABILITIES_KEY,
  schedulingServiceKey,
  schedulingServicesKey,
} from "@/hooks/scheduling/keys";

const services = getSchedulingServices();

async function requireUserId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export function useSchedulingServices(companyId: string | null) {
  return useQuery({
    queryKey: schedulingServicesKey(companyId),
    enabled: Boolean(companyId),
    queryFn: () => services.serviceCatalog.list(companyId!),
  });
}

export function useSchedulingService(companyId: string | null, serviceId: string | null) {
  return useQuery({
    queryKey: schedulingServiceKey(companyId, serviceId),
    enabled: Boolean(companyId && serviceId),
    queryFn: () => services.serviceCatalog.getById(serviceId!, companyId!),
  });
}

export function useCreateSchedulingService(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: ServiceFormValues) => {
      if (!companyId) throw new Error("Company required");
      const userId = await requireUserId();
      return services.serviceCatalog.create(companyId, userId, values);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: schedulingServicesKey(companyId) });
    },
  });
}

export function useUpdateSchedulingService(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: ServiceFormValues }) => {
      if (!companyId) throw new Error("Company required");
      const userId = await requireUserId();
      return services.serviceCatalog.update(id, companyId, userId, values);
    },
    onSuccess: (_, variables) => {
      void qc.invalidateQueries({ queryKey: schedulingServicesKey(companyId) });
      void qc.invalidateQueries({
        queryKey: schedulingServiceKey(companyId, variables.id),
      });
    },
  });
}

export function useDeleteSchedulingService(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Company required");
      await services.serviceCatalog.delete(id, companyId);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: schedulingServicesKey(companyId) });
      void qc.invalidateQueries({ queryKey: SCHEDULING_CAPABILITIES_KEY });
    },
  });
}
