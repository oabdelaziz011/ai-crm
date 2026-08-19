import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import {
  branchDetailKey,
  branchStatsKey,
  branchesListKey,
  BRANCHES_KEY,
  currentUserBranchesKey,
  invalidateBranchQueries,
  serviceBranchAvailabilityKey,
  userBranchAssignmentsKey,
} from "@/lib/company/branches/cache";
import { getBranchServices } from "@/lib/company/branches";
import { BranchManagementError } from "@/lib/company/branches/services";
import type { BranchFormValues, BranchListFilter } from "@/lib/company/branches/types";
import { isBranchLimitError } from "@/lib/billing/company-resource-limits";
import i18n from "@/i18n";

const services = getBranchServices();

export function useCompanyBranchStats(companyId: string | null) {
  return useQuery({
    queryKey: branchStatsKey(companyId),
    enabled: Boolean(companyId),
    queryFn: () => services.branches.getCompanyStats(companyId!),
  });
}

export function useBranches(companyId: string | null, filter: BranchListFilter = {}) {
  return useQuery({
    queryKey: branchesListKey(companyId, filter),
    enabled: Boolean(companyId),
    queryFn: () => services.branches.listWithStats(companyId!, filter),
  });
}

export function useBranchesInfinite(companyId: string | null, filter: BranchListFilter = {}) {
  return useInfiniteQuery({
    queryKey: [...branchesListKey(companyId, filter), "infinite"],
    enabled: Boolean(companyId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      services.branches.listPage(companyId!, filter, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

export function useBranch(companyId: string | null, branchId: string | null) {
  return useQuery({
    queryKey: branchDetailKey(companyId, branchId),
    enabled: Boolean(companyId && branchId),
    queryFn: () => services.branches.getByIdWithStats(companyId!, branchId!),
  });
}

export function useCreateBranch(companyId: string | null) {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (values: BranchFormValues) => {
      if (!companyId) throw new Error("Company required");
      return services.branches.create(companyId, values, user?.id ?? null);
    },
    onSuccess: (branch) => {
      invalidateBranchQueries(qc, companyId, branch.id);
    },
  });
}

export function useUpdateBranch(companyId: string | null, branchId: string | null) {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (values: BranchFormValues) => {
      if (!companyId || !branchId) throw new Error("Branch required");
      return services.branches.update(branchId, companyId, values, user?.id ?? null);
    },
    onMutate: async (values) => {
      if (!companyId || !branchId) return;
      await qc.cancelQueries({ queryKey: branchDetailKey(companyId, branchId) });
      const previous = qc.getQueryData(branchDetailKey(companyId, branchId));
      qc.setQueryData(branchDetailKey(companyId, branchId), (current: unknown) => {
        if (!current || typeof current !== "object") return current;
        return {
          ...current,
          name: values.name,
          code: values.code,
          status: values.status,
          is_primary: values.is_primary,
        };
      });
      return { previous };
    },
    onError: (_error, _values, context) => {
      if (context?.previous && companyId && branchId) {
        qc.setQueryData(branchDetailKey(companyId, branchId), context.previous);
      }
    },
    onSettled: () => {
      invalidateBranchQueries(qc, companyId, branchId);
    },
  });
}

export function useDeactivateBranch(companyId: string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (branchId: string) => {
      if (!companyId) throw new Error("Company required");
      return services.branches.deactivate(branchId, companyId);
    },
    onSuccess: (_branch, branchId) => {
      invalidateBranchQueries(qc, companyId, branchId);
    },
  });
}

export function useDeleteBranch(companyId: string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (branchId: string) => {
      if (!companyId) throw new Error("Company required");
      return services.branches.delete(branchId, companyId);
    },
    onSuccess: (_result, branchId) => {
      invalidateBranchQueries(qc, companyId, branchId);
    },
  });
}

export function useUserBranchAssignmentMap(companyId: string | null) {
  return useQuery({
    queryKey: userBranchAssignmentsKey(companyId),
    enabled: Boolean(companyId),
    queryFn: () => services.userAssignments.getAssignmentMap(companyId!),
  });
}

export function useCurrentUserBranches(companyId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: currentUserBranchesKey(companyId, user?.id ?? null),
    enabled: Boolean(companyId && user?.id),
    queryFn: () => services.userAssignments.resolveBranchesForUser(user!.id, companyId!),
  });
}

export function useServiceAvailableBranches(companyId: string | null, serviceId: string | null) {
  return useQuery({
    queryKey: serviceBranchAvailabilityKey(companyId, serviceId),
    enabled: Boolean(companyId && serviceId),
    queryFn: () => services.serviceAvailability.listForService(companyId!, serviceId!),
  });
}

export function useServicesBranchMap(companyId: string | null) {
  return useQuery({
    queryKey: [...BRANCHES_KEY, "services-branch-map", companyId] as const,
    enabled: Boolean(companyId),
    queryFn: () => services.serviceAvailability.listMapForCompany(companyId!),
    select: (map) => {
      const record: Record<string, { id: string; name: string; code: string | null }[]> = {};
      for (const [serviceId, branches] of map.entries()) {
        record[serviceId] = branches;
      }
      return record;
    },
  });
}

export async function syncUserBranchAssignments(
  userId: string,
  companyId: string,
  branchIds: string[],
) {
  await services.userAssignments.syncUserBranches(userId, companyId, branchIds);
}

export function formatBranchError(error: unknown): string {
  const message =
    error instanceof BranchManagementError
      ? error.message
      : error instanceof Error
        ? error.message
        : String(error ?? "");
  if (isBranchLimitError(message)) {
    return i18n.t("branches.errors.limitReached", { ns: "common" });
  }
  if (error instanceof BranchManagementError || error instanceof Error) {
    return error.message;
  }
  return "An unexpected error occurred";
}

export { invalidateBranchQueries };
