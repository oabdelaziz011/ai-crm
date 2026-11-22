import { Router, type IRouter } from "express";
import { createClient } from "@supabase/supabase-js";
import { providerOpsRateLimiter } from "../middleware/rate-limit.js";
import { requireCompanyScope, requireSupabaseAuth } from "../middleware/supabase-auth.js";
import { assertCompanyAccess } from "../middleware/assert-company-access.js";
import { HttpError } from "../middleware/error-handler.js";
import { assertRouteCommercialFeature } from "../lib/route-commercial-auth.js";
import {
  buildMetaInstagramLoginReadiness,
  getMetaInstagramLoginConnection,
  handleMetaInstagramLoginCallback,
  MetaInstagramLoginError,
  softDisconnectMetaInstagramLogin,
  startMetaInstagramLogin,
} from "../services/meta-instagram-login-oauth.js";
import { isMetaInstagramLoginEnabled } from "../services/meta-instagram-login-flags.js";

const router: IRouter = Router();

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new HttpError(503, "Supabase service credentials missing", "supabase_unavailable");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function mapError(error: unknown): never {
  if (error instanceof MetaInstagramLoginError) {
    throw new HttpError(error.statusCode, error.message, error.code);
  }
  throw error;
}

/** Public OAuth callback — no session auth; company bound via signed state. */
router.get("/oauth/instagram/callback", async (req, res) => {
  try {
    const result = await handleMetaInstagramLoginCallback({
      code: typeof req.query.code === "string" ? req.query.code : null,
      state: typeof req.query.state === "string" ? req.query.state : null,
      error: typeof req.query.error === "string" ? req.query.error : null,
      errorReason:
        typeof req.query.error_reason === "string" ? req.query.error_reason : null,
      deps: { client: getServiceClient() },
    });
    res.redirect(result.redirectUrl);
  } catch {
    const frontend =
      process.env.LOGIN_APP_URL?.replace(/\/$/, "") ||
      process.env.VITE_APP_ORIGIN?.replace(/\/$/, "") ||
      "http://localhost:5180";
    res.redirect(`${frontend}/dashboard/settings/instagram?instagram_oauth=error&reason=callback_exception`);
  }
});

router.use(providerOpsRateLimiter);

router.get(
  "/meta/instagram-login/status",
  requireSupabaseAuth,
  async (req, res, next) => {
    try {
      const companyId = String(req.query.companyId ?? "").trim();
      assertCompanyAccess(req, companyId);
      res.json(buildMetaInstagramLoginReadiness(companyId));
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/meta/instagram-login/connection",
  requireSupabaseAuth,
  async (req, res, next) => {
    try {
      if (!isMetaInstagramLoginEnabled()) {
        throw new HttpError(403, "Instagram Login OAuth is disabled.", "IGL_DISABLED");
      }
      const companyId = String(req.query.companyId ?? "").trim();
      assertCompanyAccess(req, companyId);
      await assertRouteCommercialFeature(companyId, "instagram_channel");
      const connection = await getMetaInstagramLoginConnection({
        companyId,
        deps: { client: getServiceClient() },
      });
      res.json(connection);
    } catch (error) {
      try {
        mapError(error);
      } catch (mapped) {
        next(mapped);
      }
    }
  },
);

router.post(
  "/meta/instagram-login/start",
  requireSupabaseAuth,
  requireCompanyScope("companyId"),
  async (req, res, next) => {
    try {
      const companyId = String(req.body?.companyId ?? "").trim();
      if (!companyId) throw new HttpError(400, "companyId is required");
      await assertRouteCommercialFeature(companyId, "instagram_channel");
      const session = startMetaInstagramLogin({
        companyId,
        userId: req.supabaseUser?.id ?? null,
      });
      // Never return app secret. authorizeUrl + opaque state only.
      res.json(session);
    } catch (error) {
      try {
        mapError(error);
      } catch (mapped) {
        next(mapped);
      }
    }
  },
);

router.post(
  "/meta/instagram-login/disconnect",
  requireSupabaseAuth,
  requireCompanyScope("companyId"),
  async (req, res, next) => {
    try {
      const companyId = String(req.body?.companyId ?? "").trim();
      if (!companyId) throw new HttpError(400, "companyId is required");
      await assertRouteCommercialFeature(companyId, "instagram_channel");
      const result = await softDisconnectMetaInstagramLogin({
        companyId,
        deps: { client: getServiceClient() },
      });
      res.json(result);
    } catch (error) {
      try {
        mapError(error);
      } catch (mapped) {
        next(mapped);
      }
    }
  },
);

export default router;
