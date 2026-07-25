import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { getSchedulingServices } from "@/lib/scheduling";
import type { ResourceFormValues } from "@/lib/scheduling/validation/schemas";

const services = getSchedulingServices();

export const SCHEDULING_RESOURCES_KEY = ["scheduling", "resources"] as const;
export const SCHEDULING_BRANCHES_KEY = ["scheduling", "branches"] as const;

export function schedulingResourcesKey(companyId: string | null) {
  return [...SCHEDULING_RESOURCES_KEY, companyId] as const;
}

export function schedulingResourceKey(companyId: string | null, resourceId: string | null) {
  return [...SCHEDULING_RESOURCES_KEY, companyId, resourceId] as const;
}

export function schedulingBranchesKey(companyId: string | null) {
  return [...SCHEDULING_BRANCHES_KEY, companyId] as const;
}

async function requireUserId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export function useSchedulingBranches(companyId: string | null) {
  return useQuery({
    queryKey: schedulingBranchesKey(companyId),
    enabled: Boolean(companyId),
    queryFn: () => services.branches.list(companyId!),
  });
}

export function useSchedulingResources(companyId: string | null) {
  return useQuery({
    queryKey: schedulingResourcesKey(companyId),
    enabled: Boolean(companyId),
    queryFn: () => services.resources.list(companyId!),
  });
}

export function useSchedulingResource(companyId: string | null, resourceId: string | null) {
  return useQuery({
    queryKey: schedulingResourceKey(companyId, resourceId),
    enabled: Boolean(companyId && resourceId),
    queryFn: () => services.resources.getById(resourceId!, companyId!),
  });
}

export function useCreateSchedulingResource(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: ResourceFormValues) => {
      if (!companyId) throw new Error("Company required");
      const userId = await requireUserId();
      return services.resources.create(companyId, userId, values);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: schedulingResourcesKey(companyId) });
    },
  });
}

export function useUpdateSchedulingResource(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: ResourceFormValues }) => {
      if (!companyId) throw new Error("Company required");
      const userId = await requireUserId();
      return services.resources.update(id, companyId, userId, values);
    },
    onSuccess: (_, variables) => {
      void qc.invalidateQueries({ queryKey: schedulingResourcesKey(companyId) });
      void qc.invalidateQueries({
        queryKey: schedulingResourceKey(companyId, variables.id),
      });
    },
  });
}

export function useDeleteSchedulingResource(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Company required");
      await services.resources.delete(id, companyId);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: schedulingResourcesKey(companyId) });
    },
  });
}
