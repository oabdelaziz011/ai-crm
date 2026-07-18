import { supabase } from "@/lib/supabase";
import type { AssignableRoleRecord } from "@/lib/users/role-company-validation";

type AssignableRoleRow = {
  id: string;
  name: string | null;
  is_system: boolean | null;
  role_type: "PLATFORM" | "DEFAULT" | "CUSTOM" | null;
};

/**
 * Tenant assignable roles for user management (Create/Edit User).
 * Backed by public.get_assignable_roles() — does not require roles.view.
 */
export async function fetchAssignableRolesForCompany(
  companyId: string,
): Promise<AssignableRoleRecord[]> {
  const { data, error } = await supabase.rpc("get_assignable_roles", {
    p_company_id: companyId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as AssignableRoleRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    company_id: companyId,
    is_system: row.is_system ?? false,
    role_type: row.role_type ?? "CUSTOM",
  }));
}
