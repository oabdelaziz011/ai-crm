import { useQuery } from "@tanstack/react-query";
import type { AssignmentResource } from "@workspace/assignment-governance";
import { useAuth } from "@/context/auth-context";
import { listAssignableEmployeesForActor } from "@/lib/assignment-governance/assignable-employees";
import { assignableEmployeeKeys } from "@/lib/assignment-governance/query-keys";

/**
 * Canonical React Query for employees the current actor may assign to.
 * Cache is scoped by actor + company (+ resource) — never a global employee dump.
 */
export function useAssignableEmployees(options: {
  enabled?: boolean;
  resource?: AssignmentResource;
  searchQuery?: string;
  staleTimeMs?: number;
} = {}) {
  const { user, company } = useAuth();
  const actorUserId = user?.id ?? null;
  const companyId = company?.id ?? null;
  const enabled = Boolean(actorUserId && companyId && options.enabled !== false);

  return useQuery({
    queryKey: assignableEmployeeKeys.list({
      actorUserId,
      companyId,
      resource: options.resource,
      searchQuery: options.searchQuery,
    }),
    enabled,
    staleTime: options.staleTimeMs ?? 60_000,
    queryFn: () =>
      listAssignableEmployeesForActor({
        actorUserId: actorUserId!,
        resource: options.resource,
        searchQuery: options.searchQuery,
      }),
  });
}
