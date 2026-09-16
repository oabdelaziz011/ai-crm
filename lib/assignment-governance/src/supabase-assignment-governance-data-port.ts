import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AssignmentDepartmentRef,
  AssignmentEmployeeProfile,
  AssignmentGovernanceDataPort,
} from "./types.js";

/**
 * Server-side data port. Always loads company/role/department from DB —
 * never trusts client-supplied role/company/department.
 */
export function createSupabaseAssignmentGovernanceDataPort(
  client: SupabaseClient,
): AssignmentGovernanceDataPort {
  return {
    async getEmployeeProfile(userId) {
      const { data, error } = await client
        .from("profiles")
        .select("id, company_id, is_active, is_super_admin, department_id")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return mapProfile(data as Record<string, unknown>);
    },

    async listRoleTemplateKeys(userId, companyId) {
      const { data: links, error: linkError } = await client
        .from("user_roles")
        .select("role_id")
        .eq("user_id", userId);
      if (linkError) throw new Error(linkError.message);
      const roleIds = (links ?? [])
        .map((row) => (row.role_id ? String(row.role_id) : null))
        .filter((id): id is string => Boolean(id));
      if (roleIds.length === 0) return [];

      const { data: roles, error: roleError } = await client
        .from("roles")
        .select("id, template_key, company_id")
        .in("id", roleIds)
        .eq("company_id", companyId);
      if (roleError) throw new Error(roleError.message);

      return (roles ?? [])
        .map((row) => (row.template_key ? String(row.template_key) : ""))
        .filter(Boolean);
    },

    async listManagedDepartmentIds(managerUserId, companyId) {
      const { data, error } = await client
        .from("organization_departments")
        .select("id")
        .eq("company_id", companyId)
        .eq("manager_user_id", managerUserId)
        .eq("is_active", true);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => String(row.id));
    },

    async getDepartment(departmentId) {
      const { data, error } = await client
        .from("organization_departments")
        .select("id, company_id, name, branch_id")
        .eq("id", departmentId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return mapDepartment(data as Record<string, unknown>);
    },

    async getBranchName(branchId) {
      const { data, error } = await client
        .from("branches")
        .select("name")
        .eq("id", branchId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data?.name ? String(data.name) : null;
    },

    async listCompanyActiveEmployeesWithDepartment(companyId) {
      const { data, error } = await client
        .from("profiles")
        .select("id, department_id, full_name, email, is_active")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .not("department_id", "is", null);
      if (error) throw new Error(error.message);
      return (data ?? [])
        .map((row) => {
          const departmentId = row.department_id ? String(row.department_id) : null;
          if (!departmentId) return null;
          return {
            userId: String(row.id),
            departmentId,
            fullName: row.full_name ? String(row.full_name) : null,
            email: row.email ? String(row.email) : null,
            isActive: row.is_active !== false,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row != null);
    },
  };
}

function mapProfile(row: Record<string, unknown>): AssignmentEmployeeProfile {
  return {
    id: String(row.id),
    companyId: row.company_id ? String(row.company_id) : null,
    isActive: row.is_active !== false,
    isSuperAdmin: row.is_super_admin === true,
    departmentId: row.department_id ? String(row.department_id) : null,
  };
}

function mapDepartment(row: Record<string, unknown>): AssignmentDepartmentRef {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    name: String(row.name ?? ""),
    branchId: row.branch_id ? String(row.branch_id) : null,
  };
}
