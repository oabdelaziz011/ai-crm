import { Router, type IRouter } from "express";
import { createClient } from "@supabase/supabase-js";
import { providerOpsRateLimiter } from "../middleware/rate-limit.js";
import { confineToPathPrefixes } from "../middleware/confine-router-paths.js";
import { requireCompanyScope, requireSupabaseAuth } from "../middleware/supabase-auth.js";
import { assertCompanyAccess } from "../middleware/assert-company-access.js";
import { HttpError } from "../middleware/error-handler.js";
import { assertRouteCommercialFeature } from "../lib/route-commercial-auth.js";
import {
  buildMetaMessengerLoginReadiness,
  completeMetaMessengerLogin,
  getMetaMessengerLoginConnection,
  handleMetaMessengerLoginCallback,
  listPendingMessengerPages,
  MetaMessengerLoginError,
  softDisconnectMetaMessengerLogin,
  startMetaMessengerLogin,
} from "../services/meta-messenger-login-oauth.js";
import { isMetaMessengerOauthEnabled } from "../services/meta-messenger-oauth-flags.js";

const router: IRouter = Router();

// Public callback lives under /oauth/messenger; authenticated ops under /meta/messenger-oauth.
// Confine so this root-mounted router does not rate-limit or own unrelated API paths.
router.use(confineToPathPrefixes("/oauth/messenger", "/meta/messenger-oauth"));

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
  if (error instanceof MetaMessengerLoginError) {
    throw new HttpError(error.statusCode, error.message, error.code);
  }
  throw error;
}

/** Public OAuth callback — no session auth; company bound via signed state. */
router.get("/oauth/messenger/callback", async (req, res) => {
  try {
    const result = await handleMetaMessengerLoginCallback({
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
    res.redirect(`${frontend}/dashboard/settings/messenger?messenger_oauth=error&reason=callback_exception`);
  }
});

router.use(providerOpsRateLimiter);

router.get(
  "/meta/messenger-oauth/status",
  requireSupabaseAuth,
  async (req, res, next) => {
    try {
      const companyId = String(req.query.companyId ?? "").trim();
      assertCompanyAccess(req, companyId);
      res.json(buildMetaMessengerLoginReadiness(companyId));
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/meta/messenger-oauth/connection",
  requireSupabaseAuth,
  async (req, res, next) => {
    try {
      if (!isMetaMessengerOauthEnabled()) {
        throw new HttpError(403, "Messenger OAuth is disabled.", "MSL_DISABLED");
      }
      const companyId = String(req.query.companyId ?? "").trim();
      assertCompanyAccess(req, companyId);
      await assertRouteCommercialFeature(companyId, "facebook_channel");
      const connection = await getMetaMessengerLoginConnection({
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
  "/meta/messenger-oauth/start",
  requireSupabaseAuth,
  requireCompanyScope("companyId"),
  async (req, res, next) => {
    try {
      const companyId = String(req.body?.companyId ?? "").trim();
      if (!companyId) throw new HttpError(400, "companyId is required");
      await assertRouteCommercialFeature(companyId, "facebook_channel");
      const session = startMetaMessengerLogin({
        companyId,
        userId: req.supabaseUser?.id ?? null,
      });
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

router.get(
  "/meta/messenger-oauth/pending-pages",
  requireSupabaseAuth,
  async (req, res, next) => {
    try {
      const companyId = String(req.query.companyId ?? "").trim();
      const state = String(req.query.state ?? "").trim();
      assertCompanyAccess(req, companyId);
      if (!state) throw new HttpError(400, "state is required");
      await assertRouteCommercialFeature(companyId, "facebook_channel");
      const result = listPendingMessengerPages({ companyId, state });
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

router.post(
  "/meta/messenger-oauth/complete",
  requireSupabaseAuth,
  requireCompanyScope("companyId"),
  async (req, res, next) => {
    try {
      const companyId = String(req.body?.companyId ?? "").trim();
      const state = String(req.body?.state ?? "").trim();
      const pageId = String(req.body?.pageId ?? "").trim();
      if (!companyId || !state || !pageId) {
        throw new HttpError(400, "companyId, state, and pageId are required");
      }
      await assertRouteCommercialFeature(companyId, "facebook_channel");
      const result = await completeMetaMessengerLogin({
        companyId,
        state,
        pageId,
        webhookVerifyToken: req.body?.webhookVerifyToken ?? null,
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

router.post(
  "/meta/messenger-oauth/disconnect",
  requireSupabaseAuth,
  requireCompanyScope("companyId"),
  async (req, res, next) => {
    try {
      const companyId = String(req.body?.companyId ?? "").trim();
      if (!companyId) throw new HttpError(400, "companyId is required");
      await assertRouteCommercialFeature(companyId, "facebook_channel");
      const result = await softDisconnectMetaMessengerLogin({
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
