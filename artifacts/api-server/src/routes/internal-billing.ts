import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";
import { loadPlatformEnv } from "../config/env.js";
import { HttpError } from "../middleware/error-handler.js";
import { logger } from "../lib/logger.js";
import {
  clampLifecycleEnforceLimit,
  hasClientSuppliedCompanyId,
  resolveInternalLifecycleAuth,
} from "../billing/lifecycle-http.js";

const router: IRouter = Router();
const env = loadPlatformEnv();

function requireInternalApiKey(req: Request, _res: Response, next: NextFunction): void {
  const result = resolveInternalLifecycleAuth({
    configuredKey: env.internalApiKey?.trim() || process.env.INTERNAL_API_KEY?.trim(),
    authorizationHeader: req.header("authorization"),
    internalKeyHeader: req.header("x-internal-api-key"),
  });
  if (!result.ok) {
    next(new HttpError(result.status, result.message, result.code));
    return;
  }
  next();
}

/**
 * POST /api/internal/billing/lifecycle-enforce
 * Cron/external scheduler entrypoint. Invokes Phase 7.8 orchestrator.
 * Does not fabricate payments or renewals.
 * Does not accept client company_id — enforcement is global and bounded.
 */
router.post("/lifecycle-enforce", requireInternalApiKey, async (req, res, next) => {
  try {
    const url = env.supabaseUrl;
    const key = env.supabaseServiceRoleKey;
    if (!url || !key) {
      throw new HttpError(503, "Supabase service credentials unavailable.", "supabase_unavailable");
    }

    if (hasClientSuppliedCompanyId(req.body, req.query)) {
      logger.warn("Lifecycle enforce ignored client-supplied company_id");
    }

    const limit = clampLifecycleEnforceLimit(req.body?.limit ?? req.query.limit);

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

    logger.info({ result: data, limit }, "Internal lifecycle enforce completed");

    res.json({
      ok: true,
      result: data,
      limit,
      note: "No payment fabricated. Renewal requires renew_subscription_from_payment.",
    });
  } catch (error) {
    next(error);
  }
});

export default router;
