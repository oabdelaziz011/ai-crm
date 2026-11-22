import type { Request } from "express";
import { HttpError } from "./error-handler.js";

/**
 * Verify the authenticated caller may act for companyId.
 * Use for GET handlers where companyId arrives via query (requireCompanyScope is body-only).
 */
export function assertCompanyAccess(req: Request, companyId: string): void {
  const id = String(companyId ?? "").trim();
  if (!id) {
    throw new HttpError(400, "companyId is required", "validation_error");
  }
  if (req.supabaseTenantCompanyId && req.supabaseTenantCompanyId !== id) {
    throw new HttpError(403, "Access denied for this company.", "forbidden");
  }
  if (req.supabaseIsSuperAdmin) return;
  if (!req.supabaseCompanyId || req.supabaseCompanyId !== id) {
    throw new HttpError(403, "Access denied for this company.", "forbidden");
  }
}
