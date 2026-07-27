import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getOrganizationPlatformServices } from "@/lib/organization/services/organization-platform-factory";
import {
  organizationAnalyticsKey,
  organizationOverviewKey,
  organizationSearchKey,
  organizationTransfersKey,
  ORGANIZATION_CACHE_STALE_MS,
} from "@/lib/organization/cache/query-keys";
import type { TransferRequest } from "@/lib/organization/types";

const org = getOrganizationPlatformServices();

export function useOrganizationOverview(companyId: string | null) {
  return useQuery({
    queryKey: organizationOverviewKey(companyId ?? ""),
    enabled: Boolean(companyId),
    staleTime: ORGANIZATION_CACHE_STALE_MS,
    queryFn: () => org.getOverview(companyId!),
  });
}

export function useOrganizationAnalytics(companyId: string | null, date: string) {
  return useQuery({
    queryKey: organizationAnalyticsKey(companyId ?? "", date),
    enabled: Boolean(companyId),
    staleTime: ORGANIZATION_CACHE_STALE_MS,
    queryFn: () => org.getAnalytics(companyId!, date),
  });
}

export function useOrganizationTransfers(companyId: string | null) {
  return useQuery({
    queryKey: organizationTransfersKey(companyId ?? ""),
    enabled: Boolean(companyId),
    staleTime: ORGANIZATION_CACHE_STALE_MS,
    queryFn: () => org.transfers.listAll(companyId!),
  });
}

export function useOrganizationSearch(companyId: string | null, query: string) {
  return useQuery({
    queryKey: organizationSearchKey(companyId ?? "", query),
    enabled: Boolean(companyId && query.length >= 2),
    staleTime: 15_000,
    queryFn: () => org.search.search(companyId!, query),
  });
}

export function useRequestTransfer(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<TransferRequest, "companyId">) =>
      org.transfers.requestTransfer({ ...input, companyId: companyId! }),
    onSuccess: () => {
      if (companyId) void qc.invalidateQueries({ queryKey: organizationTransfersKey(companyId) });
    },
  });
}

export function useApproveTransfer(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ transferId, approverId }: { transferId: string; approverId: string }) =>
      org.transfers.approve(companyId!, transferId, approverId),
    onSuccess: () => {
      if (companyId) void qc.invalidateQueries({ queryKey: organizationTransfersKey(companyId) });
    },
  });
}

export function useExecuteTransfer(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (transferId: string) => org.transfers.execute(companyId!, transferId),
    onSuccess: () => {
      if (companyId) {
        void qc.invalidateQueries({ queryKey: organizationTransfersKey(companyId) });
        void qc.invalidateQueries({ queryKey: organizationOverviewKey(companyId) });
      }
    },
  });
}
