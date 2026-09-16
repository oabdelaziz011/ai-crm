import type { Request } from "express";
import { createClient } from "@supabase/supabase-js";
import { HttpError } from "../middleware/error-handler.js";
import {
  CompanyPermissionDeniedError,
  requireCompanyPermission,
} from "./has-company-permission.js";

export function createUserScopedSupabaseClient(req: Request) {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anon =
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!url || !anon || !token) {
    throw new HttpError(401, "Authentication required.", "unauthorized");
  }
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/**
 * Super Admin bypasses. Everyone else must pass has_company_permission for the JWT actor.
 */
export async function requireRequestCompanyPermission(
  req: Request,
  companyId: string,
  permissionCode: string,
): Promise<void> {
  if (req.supabaseIsSuperAdmin) return;
  try {
    const userClient = createUserScopedSupabaseClient(req);
    await requireCompanyPermission(userClient, companyId, permissionCode);
  } catch (error) {
    if (error instanceof CompanyPermissionDeniedError) {
      throw new HttpError(403, "Permission denied.", "forbidden");
    }
    throw error;
  }
}

/** Pass if the actor has ANY of the listed permissions (Super Admin bypasses). */
export async function requireRequestAnyCompanyPermission(
  req: Request,
  companyId: string,
  permissionCodes: readonly string[],
): Promise<void> {
  if (req.supabaseIsSuperAdmin) return;
  if (permissionCodes.length === 0) {
    throw new HttpError(403, "Permission denied.", "forbidden");
  }
  const userClient = createUserScopedSupabaseClient(req);
  let lastError: unknown = null;
  for (const code of permissionCodes) {
    try {
      await requireCompanyPermission(userClient, companyId, code);
      return;
    } catch (error) {
      lastError = error;
      if (!(error instanceof CompanyPermissionDeniedError)) throw error;
    }
  }
  if (lastError instanceof CompanyPermissionDeniedError) {
    throw new HttpError(403, "Permission denied.", "forbidden");
  }
  throw lastError;
}
