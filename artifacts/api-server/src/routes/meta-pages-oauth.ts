import { Router, type IRouter } from "express";
import { createClient } from "@supabase/supabase-js";
import { providerOpsRateLimiter } from "../middleware/rate-limit.js";
import { requireCompanyScope, requireSupabaseAuth } from "../middleware/supabase-auth.js";
import { confineToPathPrefixes } from "../middleware/confine-router-paths.js";
import { HttpError } from "../middleware/error-handler.js";
import { assertRouteCommercialFeature } from "../lib/route-commercial-auth.js";
import {
  isMetaPagesOauthCompanyAllowed,
  isMetaPagesOauthEnabled,
} from "../services/meta-pages-oauth-flags.js";
import {
  buildMetaPagesOauthReadiness,
  completeMetaPagesOauth,
  createMetaPagesOauthSession,
  discoverMetaPageAssets,
  MetaPagesOauthError,
  softDisconnectMetaChannel,
  type MetaPagesOauthChannel,
} from "../services/meta-pages-oauth.js";

const router: IRouter = Router();

router.use(providerOpsRateLimiter);
router.use(confineToPathPrefixes("/meta"));
router.use(requireSupabaseAuth);
router.use(requireCompanyScope("companyId"));

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
  if (error instanceof MetaPagesOauthError) {
    throw new HttpError(error.statusCode, error.message, error.code);
  }
  throw error;
}

function parseChannel(raw: unknown): MetaPagesOauthChannel {
  const channel = String(raw ?? "").trim().toLowerCase();
  if (channel !== "messenger" && channel !== "instagram") {
    throw new HttpError(400, "channel must be messenger or instagram", "MPO_CHANNEL_INVALID");
  }
  return channel;
}

function assertEnabled(): void {
  if (!isMetaPagesOauthEnabled()) {
    throw new HttpError(403, "Meta Pages OAuth is disabled.", "MPO_DISABLED");
  }
}

function assertCompanyAllowed(companyId: string): void {
  if (!isMetaPagesOauthCompanyAllowed(companyId)) {
    throw new HttpError(403, "Meta Pages OAuth is not available for this company.", "MPO_COMPANY_NOT_ALLOWED");
  }
}

router.get("/meta/pages-oauth/status", async (req, res, next) => {
  try {
    const companyId = String(req.query.companyId ?? "").trim();
    if (!companyId) throw new HttpError(400, "companyId is required");
    res.json(buildMetaPagesOauthReadiness(companyId));
  } catch (error) {
    next(error);
  }
});

router.post("/meta/pages-oauth/session", async (req, res, next) => {
  try {
    assertEnabled();
    const companyId = String(req.body?.companyId ?? "").trim();
    const channel = parseChannel(req.body?.channel);
    if (!companyId) throw new HttpError(400, "companyId is required");
    assertCompanyAllowed(companyId);
    const feature = channel === "instagram" ? "instagram_channel" : "facebook_channel";
    await assertRouteCommercialFeature(companyId, feature);
    const session = createMetaPagesOauthSession({
      companyId,
      userId: req.supabaseUser?.id ?? null,
      channel,
    });
    res.json(session);
  } catch (error) {
    try {
      mapError(error);
    } catch (mapped) {
      next(mapped);
    }
  }
});

router.post("/meta/pages-oauth/assets", async (req, res, next) => {
  try {
    assertEnabled();
    const companyId = String(req.body?.companyId ?? "").trim();
    const channel = parseChannel(req.body?.channel);
    const code = String(req.body?.code ?? "").trim();
    const state = String(req.body?.state ?? "").trim();
    if (!companyId || !code || !state) {
      throw new HttpError(400, "companyId, code, and state are required");
    }
    assertCompanyAllowed(companyId);
    const feature = channel === "instagram" ? "instagram_channel" : "facebook_channel";
    await assertRouteCommercialFeature(companyId, feature);
    const result = await discoverMetaPageAssets({
      companyId,
      channel,
      code,
      state,
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
});

router.post("/meta/pages-oauth/complete", async (req, res, next) => {
  try {
    assertEnabled();
    const companyId = String(req.body?.companyId ?? "").trim();
    const channel = parseChannel(req.body?.channel);
    const code = String(req.body?.code ?? "").trim();
    const state = String(req.body?.state ?? "").trim();
    const pageId = String(req.body?.pageId ?? "").trim();
    if (!companyId || !code || !state || !pageId) {
      throw new HttpError(400, "companyId, code, state, and pageId are required");
    }
    assertCompanyAllowed(companyId);
    const feature = channel === "instagram" ? "instagram_channel" : "facebook_channel";
    await assertRouteCommercialFeature(companyId, feature);
    const result = await completeMetaPagesOauth({
      companyId,
      userId: req.supabaseUser?.id ?? null,
      channel,
      code,
      state,
      pageId,
      instagramBusinessAccountId: req.body?.instagramBusinessAccountId ?? null,
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
});

router.post("/meta/pages-oauth/disconnect", async (req, res, next) => {
  try {
    const companyId = String(req.body?.companyId ?? "").trim();
    const channel = parseChannel(req.body?.channel);
    if (!companyId) throw new HttpError(400, "companyId is required");
    const feature = channel === "instagram" ? "instagram_channel" : "facebook_channel";
    await assertRouteCommercialFeature(companyId, feature);
    const result = await softDisconnectMetaChannel({
      companyId,
      channel,
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
});

export default router;
