import { useQuery } from "@tanstack/react-query";
import { EmployeeIdentityService } from "@/lib/employee-identity/employee-identity-service";
import { employeeIdentityKeys } from "@/lib/employee-identity/query-keys";
import type { EmployeeIdentity } from "@/lib/employee-identity/types";
import { APP_QUERY_STALE_MS } from "@/lib/react-query/create-query-client";

/** Cached identity lookup — never refetch per card when query key is shared. */
export function useEmployeeIdentity(profileOrUserId: string | null | undefined) {
  const id = profileOrUserId?.trim() || "";
  return useQuery({
    queryKey: employeeIdentityKeys.byId(id),
    enabled: Boolean(id),
    staleTime: APP_QUERY_STALE_MS,
    queryFn: () => EmployeeIdentityService.getById(id),
  });
}

export function useEmployeeIdentities(ids: readonly (string | null | undefined)[]) {
  const cleaned = [...new Set(ids.map((id) => id?.trim()).filter(Boolean))] as string[];
  return useQuery({
    queryKey: employeeIdentityKeys.many(cleaned),
    enabled: cleaned.length > 0,
    staleTime: APP_QUERY_STALE_MS,
    queryFn: async (): Promise<Map<string, EmployeeIdentity>> =>
      EmployeeIdentityService.getManyByIds(cleaned),
  });
}
