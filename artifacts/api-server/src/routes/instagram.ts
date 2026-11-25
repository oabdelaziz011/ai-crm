import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import {
  createSupabaseInstagramCredentialsLoader,
  parseInstagramChannelReferences,
  performInstagramOutboundHealthCheck,
  resolveInstagramRuntimeConfiguration,
} from "@workspace/channel-platform";
import { logger } from "../lib/logger.js";
import { applyApiCorsHeaders } from "../middleware/cors.js";
import { HttpError } from "../middleware/error-handler.js";
import { confineToPathPrefixes } from "../middleware/confine-router-paths.js";
import { requireCompanyScope, requireSupabaseAuth } from "../middleware/supabase-auth.js";
import { getWebhookPlatform } from "../platform/create-webhook-platform.js";
import {
  isInstagramOutboundHealthPath,
  timeInstagramHealthStage,
  withInstagramHealthTimeout,
  wrapInstagramHealthHardDeadline,
  wrapInstagramHealthMiddleware,
} from "./instagram-health-diag.js";

/** Keep Meta Graph JSON+CORS ahead of Cloudflare/Nginx proxy budgets (which have no ACAO). */
export const INSTAGRAM_OUTBOUND_HEALTH_TIMEOUT_MS = 20_000;

const router: IRouter = Router();

// Do not run auth for unrelated paths (e.g. public /oauth/*/callback) that share the API root mount.
router.use(confineToPathPrefixes("/instagram"));

router.use((req: Request, res: Response, next: NextFunction) => {
  if (!isInstagramOutboundHealthPath(req) || req.method === "OPTIONS") {
    next();
    return;
  }

  const started = Date.now();
  logger.info(
    {
      instagramHealthDiag: true,
      stage: "received",
      method: req.method,
      origin: req.header("origin") ?? null,
      hasAuthorization: Boolean(req.header("authorization")),
      requestId: req.requestId,
      correlationId: req.correlationId,
    },
    "instagram.channel-outbound-health received",
  );

  res.on("finish", () => {
    logger.info(
      {
        instagramHealthDiag: true,
        stage: "finished",
        method: req.method,
        statusCode: res.statusCode,
        durationMs: Date.now() - started,
        requestId: req.requestId,
        correlationId: req.correlationId,
      },
      "instagram.channel-outbound-health finished",
    );
  });

  next();
});

// Hard deadline writes JSON+CORS itself if anything below hangs past the proxy-safe budget.
router.use(wrapInstagramHealthHardDeadline());
// Path-gated timing wrappers only; shared auth/scope implementations are unchanged.
router.use(wrapInstagramHealthMiddleware("supabase_auth", requireSupabaseAuth));
router.use(wrapInstagramHealthMiddleware("company_scope", requireCompanyScope("companyId")));

router.post("/instagram/channel-outbound-health", async (req, res, next) => {
  try {
    const companyId = String(req.body?.companyId ?? "");
    const companyChannelId = String(req.body?.companyChannelId ?? "");
    if (!companyChannelId) {
      res.status(400).json({ error: "companyChannelId is required" });
      return;
    }

    const platform = getWebhookPlatform();
    const channel = await timeInstagramHealthStage(req, "channel_lookup", () =>
      platform.ports.registry.getCompanyChannel(companyChannelId),
    );
    if (!channel || channel.companyId !== companyId || channel.channelKey !== "instagram") {
      res.status(404).json({ error: "instagram_channel_not_found" });
      return;
    }

    const credentialsLoader = createSupabaseInstagramCredentialsLoader(platform.client);
    const runtimeConfig = await timeInstagramHealthStage(req, "credentials_load", () =>
      resolveInstagramRuntimeConfiguration(
        companyId,
        parseInstagramChannelReferences(channel.configuration),
        credentialsLoader,
      ),
    );

    const report = await timeInstagramHealthStage(req, "meta_health", async () => {
      const abort = new AbortController();
      const abortTimer = setTimeout(() => abort.abort(), INSTAGRAM_OUTBOUND_HEALTH_TIMEOUT_MS);
      try {
        return await withInstagramHealthTimeout(
          performInstagramOutboundHealthCheck({
            companyId,
            runtimeConfig,
            signal: abort.signal,
          }),
          INSTAGRAM_OUTBOUND_HEALTH_TIMEOUT_MS,
          () =>
            new HttpError(
              504,
              "Instagram health check timed out before Meta Graph responded.",
              "instagram_health_timeout",
            ),
        );
      } finally {
        clearTimeout(abortTimer);
      }
    });

    // Heal stale stored IG_ID when /me returns the messaging user_id (IG Login).
    const resolvedId = String(report.resolvedInstagramBusinessAccountId ?? "").trim();
    const configuredId = String(runtimeConfig.instagramBusinessAccountId ?? "").trim();
    if (report.ok && resolvedId && resolvedId !== configuredId) {
      try {
        await timeInstagramHealthStage(req, "heal_instagram_business_account_id", async () => {
          await platform.client
            .from("company_instagram_settings")
            .update({
              instagram_business_account_id: resolvedId,
              updated_at: new Date().toISOString(),
            })
            .eq("company_id", companyId);

          const nextConfiguration = {
            ...channel.configuration,
            instagramBusinessAccountId: resolvedId,
          };
          await platform.client
            .from("company_channels")
            .update({ configuration: nextConfiguration })
            .eq("id", companyChannelId)
            .eq("company_id", companyId)
            .is("deleted_at", null);
        });
        logger.info(
          {
            instagramHealthDiag: true,
            stage: "heal_instagram_business_account_id",
            companyId,
            companyChannelId,
            requestId: req.requestId,
          },
          "instagram.channel-outbound-health healed stored IG_ID from /me user_id",
        );
      } catch (healError) {
        logger.warn(
          {
            instagramHealthDiag: true,
            stage: "heal_instagram_business_account_id_failed",
            companyId,
            companyChannelId,
            requestId: req.requestId,
            error: healError instanceof Error ? healError.message : String(healError),
          },
          "instagram.channel-outbound-health IG_ID heal failed",
        );
      }
    }

    // Always HTTP 200 for a completed health evaluation (ok true/false in body).
    // Application-level failure must NOT use HTTP 502: proxies/CDN treat 502 as a
    // gateway error and browsers then surface CORS/"Failed to fetch" instead of JSON.
    applyApiCorsHeaders(req, res);
    res.status(200).json(report);
  } catch (error) {
    next(error);
  }
});

export default router;
