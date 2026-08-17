import type { SupabaseClient } from "@supabase/supabase-js";

export class CompanyPermissionDeniedError extends Error {
  readonly code = "COMPANY_PERMISSION_DENIED";
  readonly permissionCode: string;

  constructor(permissionCode: string, message?: string) {
    super(message ?? `Permission "${permissionCode}" is not authorized for this company`);
    this.name = "CompanyPermissionDeniedError";
    this.permissionCode = permissionCode;
  }
}

/**
 * Product authorization via has_company_permission RPC.
 * Caller must pass a user-scoped Supabase client (JWT) so user_has_permission
 * evaluates the authenticated actor. Does not replace commercial feature gates.
 */
export async function isCompanyPermissionAuthorized(
  client: SupabaseClient,
  companyId: string,
  permissionCode: string,
): Promise<boolean> {
  const { data, error } = await client.rpc("has_company_permission", {
    p_company_id: companyId,
    p_code: permissionCode,
  });
  if (error) return false;
  return Boolean(data);
}

export async function requireCompanyPermission(
  client: SupabaseClient,
  companyId: string,
  permissionCode: string,
): Promise<void> {
  const ok = await isCompanyPermissionAuthorized(client, companyId, permissionCode);
  if (!ok) throw new CompanyPermissionDeniedError(permissionCode);
}
