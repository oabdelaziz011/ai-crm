/**
 * Native session bootstrap.
 *
 * The caller is already authenticated with a Supabase user token. The company
 * is resolved from X-ValueOR-Instance, never from a client-supplied company id.
 * Web cookie sessions and existing /api routes are unchanged.
 */
import { Router, type IRouter } from "express";
import { HttpError } from "../middleware/error-handler.js";
import { requireSupabaseAuth } from "../middleware/supabase-auth.js";
import { MOBILE_INSTANCE_HEADER } from "../mobile/mobile-access.js";
import { resolveMobilePrincipal } from "../mobile/mobile-principal.js";

const router: IRouter = Router();

router.get("/mobile/session", requireSupabaseAuth, async (req, res, next) => {
  try {
    const principal = await resolveMobilePrincipal({
      userId: req.supabaseUser?.id ?? null,
      token: req.supabaseAuthToken ?? null,
      profileCompanyId: req.supabaseCompanyId ?? null,
      isSuperAdmin: Boolean(req.supabaseIsSuperAdmin),
      instanceHeader: req.header(MOBILE_INSTANCE_HEADER),
    });
    if (!principal.ok) {
      res.status(principal.status).json({ code: principal.code, message: principal.message });
      return;
    }
    res.json({
      scope: principal.scope,
      isSuperAdmin: principal.isSuperAdmin,
      userId: principal.userId,
      displayName: principal.displayName,
      company: principal.company,
      permissions: principal.permissions,
    });
  } catch (error) {
    next(error instanceof HttpError ? error : error);
  }
});

export default router;
