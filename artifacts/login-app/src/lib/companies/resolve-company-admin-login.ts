import { supabase } from "@/lib/supabase";

export type CompanyAdminLoginIdentity = {
  userId: string;
  email: string;
  fullName: string | null;
};

/**
 * Resolve company admin login identity for UI preview.
 * Source of truth: active profile with roles.template_key = 'admin'.
 * Never uses companies.contact_email.
 */
export async function resolveCompanyAdminLoginIdentity(
  companyId: string,
): Promise<CompanyAdminLoginIdentity | null> {
  const { data: roles, error: rolesError } = await supabase
    .from("roles")
    .select("id")
    .eq("company_id", companyId)
    .eq("template_key", "admin");

  if (rolesError) throw new Error(rolesError.message);
  const roleIds = (roles ?? []).map((r) => r.id).filter(Boolean);
  if (roleIds.length === 0) return null;

  const { data: assignments, error: assignError } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role_id", roleIds);

  if (assignError) throw new Error(assignError.message);
  const userIds = [...new Set((assignments ?? []).map((a) => a.user_id).filter(Boolean))];
  if (userIds.length === 0) return null;

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, full_name, created_at")
    .in("id", userIds)
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1);

  if (profileError) throw new Error(profileError.message);
  const row = profiles?.[0];
  if (!row?.id || !row.email) return null;

  return {
    userId: row.id,
    email: row.email,
    fullName: row.full_name ?? null,
  };
}
