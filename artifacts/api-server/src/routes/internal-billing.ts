import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";
import { loadPlatformEnv } from "../config/env.js";
import { HttpError } from "../middleware/error-handler.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();
const env = loadPlatformEnv();

function requireInternalApiKey(req: Request, _res: Response, next: NextFunction): void {
  const configuredKey = env.internalApiKey?.trim() || process.env.INTERNAL_API_KEY?.trim();
  if (!configuredKey) {
    next(new HttpError(503, "Internal API key not configured.", "internal_key_missing"));
    return;
  }
  const bearer = req.header("authorization")?.startsWith("Bearer ")
    ? req.header("authorization")!.slice("Bearer ".length).trim()
    : null;
  const headerKey = req.header("x-internal-api-key")?.trim();
  if (bearer !== configuredKey && headerKey !== configuredKey) {
    next(new HttpError(401, "Internal authentication required.", "unauthorized"));
    return;
  }
  next();
}

/**
 * POST /api/internal/billing/lifecycle-enforce
 * Cron/external scheduler entrypoint. Invokes Phase 7.8 orchestrator.
 * Does not fabricate payments or renewals.
 */
router.post("/lifecycle-enforce", requireInternalApiKey, async (req, res, next) => {
  try {
    const url = env.supabaseUrl;
    const key = env.supabaseServiceRoleKey;
    if (!url || !key) {
      throw new HttpError(503, "Supabase service credentials unavailable.", "supabase_unavailable");
    }

    const limitRaw = Number(req.body?.limit ?? req.query.limit ?? 100);
    const limit = Math.max(1, Math.min(500, Number.isFinite(limitRaw) ? limitRaw : 100));

    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await client.rpc("run_subscription_lifecycle_enforcement_v1", {
      p_limit: limit,
    });

    if (error) {
      logger.warn({ err: error }, "Internal lifecycle enforce RPC failed");
      throw new HttpError(500, error.message, "lifecycle_enforce_failed");
    }

    res.json({
      ok: true,
      result: data,
      note: "No payment fabricated. Renewal requires renew_subscription_from_payment.",
    });
  } catch (error) {
    next(error);
  }
});

export default router;
