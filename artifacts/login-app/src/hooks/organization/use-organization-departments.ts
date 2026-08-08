import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { OrganizationRepository } from "@/lib/organization/repositories/organization-repository";
import type {
  OrganizationDepartmentInput,
  OrganizationDepartmentWithStats,
} from "@/lib/organization/types";
import { APP_QUERY_STALE_MS } from "@/lib/react-query/create-query-client";
import { supabase } from "@/lib/supabase";

const repo = new OrganizationRepository(supabase);

export function organizationDepartmentsKey(companyId: string | null) {
  return ["organization-departments", companyId] as const;
}

export function useOrganizationDepartments(companyId: string | null, includeInactive = true) {
  return useQuery({
    queryKey: [...organizationDepartmentsKey(companyId), includeInactive ? "all" : "active"],
    enabled: Boolean(companyId),
    staleTime: APP_QUERY_STALE_MS,
    queryFn: async (): Promise<OrganizationDepartmentWithStats[]> => {
      const departments = await repo.listDepartments(companyId!, undefined, { includeInactive });
      return repo.attachDepartmentStats(companyId!, departments);
    },
  });
}

const USERS_HINT = ["users-management"] as const;

function invalidateDepartmentCaches(qc: ReturnType<typeof useQueryClient>, companyId: string | null) {
  void qc.invalidateQueries({ queryKey: organizationDepartmentsKey(companyId) });
  void qc.invalidateQueries({ queryKey: ["company-workspace"] });
  void qc.invalidateQueries({ queryKey: ["organization"] });
  void qc.invalidateQueries({ queryKey: USERS_HINT });
}

export function useCreateOrganizationDepartment(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OrganizationDepartmentInput) => {
      if (!companyId) throw new Error("Company required");
      return repo.createDepartment(companyId, input);
    },
    onSuccess: () => invalidateDepartmentCaches(qc, companyId),
  });
}

export function useUpdateOrganizationDepartment(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OrganizationDepartmentInput & { id: string; previousName?: string | null }) => {
      if (!companyId) throw new Error("Company required");
      const { id, previousName, ...values } = input;
      return repo.updateDepartment(id, companyId, { ...values, previousName });
    },
    onSuccess: () => invalidateDepartmentCaches(qc, companyId),
  });
}

export function useSetOrganizationDepartmentActive(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => {
      if (!companyId) throw new Error("Company required");
      return repo.setDepartmentActive(id, companyId, isActive);
    },
    onSuccess: () => invalidateDepartmentCaches(qc, companyId),
  });
}

export function useDeleteOrganizationDepartment(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => {
      if (!companyId) throw new Error("Company required");
      return repo.deleteDepartment(id, companyId, name);
    },
    onSuccess: () => invalidateDepartmentCaches(qc, companyId),
  });
}

export function useMergeOrganizationDepartments(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sourceId, targetId }: { sourceId: string; targetId: string }) => {
      if (!companyId) throw new Error("Company required");
      return repo.mergeDepartments(sourceId, targetId);
    },
    onSuccess: () => invalidateDepartmentCaches(qc, companyId),
  });
}

export function useCountOrganizationDepartmentDependencies(companyId: string | null) {
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => {
      if (!companyId) throw new Error("Company required");
      return repo.countDepartmentDependencies(id, companyId, name);
    },
  });
}
