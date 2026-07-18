import { useQuery } from "@tanstack/react-query";
import { fetchAssignableRolesForCompany } from "@/lib/users/fetch-assignable-roles";
import type { AssignableRoleRecord } from "@/lib/users/role-company-validation";

export type CompanyAssignableRole = AssignableRoleRecord;

/**
 * Roles assignable for a company via get_assignable_roles RPC.
 * Kept separate from use-rbac to avoid requiring roles.view on the Users page.
 */
export function useCompanyAssignableRoles(
  companyId: string | null | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: ["users", "assignable-roles", companyId ?? "none"],
    enabled: enabled && Boolean(companyId),
    queryFn: async (): Promise<CompanyAssignableRole[]> => {
      return fetchAssignableRolesForCompany(companyId!);
    },
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
  });
}
