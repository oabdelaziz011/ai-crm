/**
 * POST /email/workspace-channel — resolve the company's Email channel for Email Workspace.
 *
 * Email agents have email.view but not channels.view. Client SELECT on
 * company_channels is blocked by RLS; this route reads with the service role
 * after verifying email.view + email_channel entitlement.
 * Returns public Email channel metadata only — never credentials or secrets.
 */
import { Router, type IRouter, type Request } from "express";
import { createClient } from "@supabase/supabase-js";
import { providerOpsRateLimiter } from "../middleware/rate-limit.js";
import { requireCompanyScope, requireSupabaseAuth } from "../middleware/supabase-auth.js";
import { HttpError } from "../middleware/error-handler.js";
import { assertRouteCommercialFeature } from "../lib/route-commercial-auth.js";
import {
  CompanyPermissionDeniedError,
  requireCompanyPermission,
} from "../lib/has-company-permission.js";
import {
  COMPANY_CHANNEL_SELECT,
  pickCompanyEmailChannel,
  toPublicEmailWorkspaceChannel,
  type CompanyChannelRow,
} from "../lib/company-email-channel.js";

const router: IRouter = Router();

router.use(providerOpsRateLimiter);
router.use(requireSupabaseAuth);
router.use(requireCompanyScope("companyId"));

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

function resolveEffectiveCompanyId(req: Request): string {
  const companyId = String(req.body?.companyId ?? "");
  const effectiveCompanyId =
    req.supabaseIsSuperAdmin && companyId
      ? companyId
      : (req.supabaseCompanyId ?? companyId);
  if (!effectiveCompanyId) {
    throw new HttpError(400, "companyId required", "validation_error");
  }
  return effectiveCompanyId;
}

router.post("/email/workspace-channel", async (req, res, next) => {
  try {
    const companyId = resolveEffectiveCompanyId(req);
    await assertRouteCommercialFeature(companyId, "email_channel");
    if (!req.supabaseIsSuperAdmin) {
      const userClient = getUserScopedClient(req);
      try {
        await requireCompanyPermission(userClient, companyId, "email.view");
      } catch (error) {
        if (error instanceof CompanyPermissionDeniedError) {
          throw new HttpError(403, "Permission denied.", "forbidden");
        }
        throw error;
      }
    }

    const client = getServiceClient();
    const { data, error } = await client
      .from("company_channels")
      .select(COMPANY_CHANNEL_SELECT)
      .eq("company_id", companyId)
      .is("deleted_at", null);

    if (error) throw error;

    const picked = pickCompanyEmailChannel(companyId, (data ?? []) as CompanyChannelRow[]);
    res.json({
      channel: picked ? toPublicEmailWorkspaceChannel(picked) : null,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
