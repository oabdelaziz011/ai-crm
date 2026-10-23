/**
 * Human-authorized Complete Demo: demo_scheduled → demo_completed.
 * Company identity comes from authenticated Supabase context only.
 * Does not create Opportunities or send outbound messages.
 */
import { Router, type IRouter, type Request } from "express";
import { createClient } from "@supabase/supabase-js";
import { createLeadPlatformServices, LEAD_PERMISSIONS } from "@workspace/lead-platform";
import { requireSupabaseAuth } from "../middleware/supabase-auth.js";
import { HttpError } from "../middleware/error-handler.js";
import {
  CompanyPermissionDeniedError,
  requireCompanyPermission,
} from "../lib/has-company-permission.js";
import { completeSalesDemo } from "../services/sales-demo-crm-lifecycle.js";

const router: IRouter = Router();

router.use(requireSupabaseAuth);

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new HttpError(503, "Supabase service credentials missing", "auth_unavailable");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getUserScopedClient(req: Request) {
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

router.post("/leads/:leadId/complete-demo", async (req, res, next) => {
  try {
    const companyId = req.supabaseCompanyId;
    const userId = req.supabaseUser?.id;
    if (!companyId) {
      throw new HttpError(401, "Authenticated company context required", "unauthorized");
    }
    if (!userId) {
      throw new HttpError(401, "Authenticated user required", "unauthorized");
    }

    try {
      await requireCompanyPermission(getUserScopedClient(req), companyId, LEAD_PERMISSIONS.edit);
    } catch (error) {
      if (error instanceof CompanyPermissionDeniedError) {
        throw new HttpError(403, "Permission denied.", "forbidden");
      }
      throw error;
    }

    const platform = createLeadPlatformServices(getServiceClient());
    // Permission already enforced via user-scoped has_company_permission(leads.edit).
    // LeadCommandService still consults hasPermission for stage moves — grant the edit set only.
    const allowed = new Set<string>([LEAD_PERMISSIONS.view, LEAD_PERMISSIONS.edit]);
    const ctx = {
      userId,
      companyId,
      isSuperAdmin: Boolean(req.supabaseIsSuperAdmin),
      hasPermission: (code: string) =>
        Boolean(req.supabaseIsSuperAdmin) || allowed.has(code),
    };

    const { lead } = await completeSalesDemo(platform, ctx, {
      leadId: String(req.params.leadId),
    });
    res.json({ ok: true, lead });
  } catch (error) {
    if (error instanceof HttpError) {
      next(error);
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (/not found/i.test(message)) {
      next(new HttpError(404, message, "not_found"));
      return;
    }
    if (/must be demo_scheduled|companyId must match|required/i.test(message)) {
      next(new HttpError(400, message, "validation_error"));
      return;
    }
    next(error);
  }
});

export default router;
