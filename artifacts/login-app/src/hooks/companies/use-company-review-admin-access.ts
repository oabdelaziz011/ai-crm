import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { fetchRolePermissionCodes } from "@/hooks/use-rbac";
import { fetchAssignableRolesForCompany } from "@/lib/users/fetch-assignable-roles";

export type CompanyReviewOwner = {
  id: string;
  full_name: string | null;
  email: string | null;
  job_title: string | null;
};

export type CompanyReviewAdminAccess = {
  owners: CompanyReviewOwner[];
  adminRole: {
    id: string;
    name: string | null;
    template_key: string | null;
  } | null;
  assignableRoles: Awaited<ReturnType<typeof fetchAssignableRolesForCompany>>;
  ownerRoleId: string | null;
};

export function useCompanyReviewAdminAccess(companyId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["company-review", "admin-access", companyId],
    enabled: enabled && Boolean(companyId),
    queryFn: async (): Promise<CompanyReviewAdminAccess> => {
      if (!companyId) {
        return {
          owners: [],
          adminRole: null,
          assignableRoles: [],
          ownerRoleId: null,
        };
      }

      const [profilesRes, rolesRes, assignableRoles] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email, job_title")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("created_at", { ascending: true }),
        supabase
          .from("roles")
          .select("id, name, template_key, role_type")
          .eq("company_id", companyId)
          .order("name"),
        fetchAssignableRolesForCompany(companyId),
      ]);

      if (profilesRes.error) throw new Error(profilesRes.error.message);
      if (rolesRes.error) throw new Error(rolesRes.error.message);

      const owners = (profilesRes.data ?? []) as CompanyReviewOwner[];
      const roles = rolesRes.data ?? [];
      const adminRole =
        roles.find((row) => row.template_key === "admin") ??
        roles.find((row) => /admin/i.test(row.name ?? "")) ??
        null;

      let ownerRoleId: string | null = null;
      if (owners[0]?.id) {
        const { data: userRoles, error: userRolesError } = await supabase
          .from("user_roles")
          .select("role_id")
          .eq("user_id", owners[0].id)
          .limit(1)
          .maybeSingle();
        if (userRolesError) throw new Error(userRolesError.message);
        ownerRoleId = userRoles?.role_id ?? null;
      }

      return {
        owners,
        adminRole: adminRole
          ? {
              id: adminRole.id,
              name: adminRole.name,
              template_key: adminRole.template_key,
            }
          : null,
        assignableRoles,
        ownerRoleId,
      };
    },
  });
}

export function useCompanyReviewRolePermissions(roleId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["company-review", "role-permissions", roleId],
    enabled: enabled && Boolean(roleId),
    queryFn: async () => {
      if (!roleId) return [] as string[];
      return fetchRolePermissionCodes(roleId);
    },
  });
}
