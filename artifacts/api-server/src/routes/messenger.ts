import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import {
  createSupabaseMessengerCredentialsLoader,
  parseMessengerChannelReferences,
  performMessengerOutboundHealthCheck,
  resolveMessengerRuntimeConfiguration,
} from "@workspace/channel-platform";
import { logger } from "../lib/logger.js";
import { applyApiCorsHeaders } from "../middleware/cors.js";
import { HttpError } from "../middleware/error-handler.js";
import { confineToPathPrefixes } from "../middleware/confine-router-paths.js";
import { requireCompanyScope, requireSupabaseAuth } from "../middleware/supabase-auth.js";
import { getWebhookPlatform } from "../platform/create-webhook-platform.js";
import {
  isMessengerOutboundHealthPath,
  timeMessengerHealthStage,
  withMessengerHealthTimeout,
  wrapMessengerHealthHardDeadline,
  wrapMessengerHealthMiddleware,
} from "./messenger-health-diag.js";

/** Keep Meta Graph JSON+CORS ahead of Cloudflare/Nginx proxy budgets (which have no ACAO). */
export const MESSENGER_OUTBOUND_HEALTH_TIMEOUT_MS = 20_000;

const router: IRouter = Router();

// Do not run auth for unrelated paths (e.g. public /oauth/*/callback) that share the API root mount.
router.use(confineToPathPrefixes("/messenger"));

router.use((req: Request, res: Response, next: NextFunction) => {
  if (!isMessengerOutboundHealthPath(req) || req.method === "OPTIONS") {
    next();
    return;
  }

  const started = Date.now();
  logger.info(
    {
      messengerHealthDiag: true,
      stage: "received",
      method: req.method,
      origin: req.header("origin") ?? null,
      hasAuthorization: Boolean(req.header("authorization")),
      requestId: req.requestId,
      correlationId: req.correlationId,
    },
    "messenger.channel-outbound-health received",
  );

  res.on("finish", () => {
    logger.info(
      {
        messengerHealthDiag: true,
        stage: "finished",
        method: req.method,
        statusCode: res.statusCode,
        durationMs: Date.now() - started,
        requestId: req.requestId,
        correlationId: req.correlationId,
      },
      "messenger.channel-outbound-health finished",
    );
  });

  next();
});

// Hard deadline writes JSON+CORS itself if anything below hangs past the proxy-safe budget.
router.use(wrapMessengerHealthHardDeadline());

// Health path: timed auth/scope wrappers. Other Messenger routes keep plain auth/scope.
const messengerHealthAuth = wrapMessengerHealthMiddleware("supabase_auth", requireSupabaseAuth);
const messengerHealthScope = wrapMessengerHealthMiddleware(
  "company_scope",
  requireCompanyScope("companyId"),
);
const messengerCompanyScope = requireCompanyScope("companyId");

router.use((req: Request, res: Response, next: NextFunction) => {
  if (isMessengerOutboundHealthPath(req) && req.method !== "OPTIONS") {
    return messengerHealthAuth(req, res, next);
  }
  return requireSupabaseAuth(req, res, next);
});
router.use((req: Request, res: Response, next: NextFunction) => {
  if (isMessengerOutboundHealthPath(req) && req.method !== "OPTIONS") {
    return messengerHealthScope(req, res, next);
  }
  return messengerCompanyScope(req, res, next);
});

router.post("/messenger/channel-outbound-health", async (req, res, next) => {
  try {
    const companyId = String(req.body?.companyId ?? "");
    const companyChannelId = String(req.body?.companyChannelId ?? "");
    if (!companyChannelId) {
      res.status(400).json({ error: "companyChannelId is required" });
      return;
    }

    const platform = getWebhookPlatform();
    const channel = await timeMessengerHealthStage(req, "channel_lookup", () =>
      platform.ports.registry.getCompanyChannel(companyChannelId),
    );
    if (!channel || channel.companyId !== companyId || channel.channelKey !== "messenger") {
      res.status(404).json({ error: "messenger_channel_not_found" });
      return;
    }

    const credentialsLoader = createSupabaseMessengerCredentialsLoader(platform.client);
    const runtimeConfig = await timeMessengerHealthStage(req, "credentials_load", () =>
      resolveMessengerRuntimeConfiguration(
        companyId,
        parseMessengerChannelReferences(channel.configuration),
        credentialsLoader,
      ),
    );

    const report = await timeMessengerHealthStage(req, "meta_health", async () => {
      const abort = new AbortController();
      const abortTimer = setTimeout(() => abort.abort(), MESSENGER_OUTBOUND_HEALTH_TIMEOUT_MS);
      try {
        return await withMessengerHealthTimeout(
          performMessengerOutboundHealthCheck({
            companyId,
            runtimeConfig,
            signal: abort.signal,
          }),
          MESSENGER_OUTBOUND_HEALTH_TIMEOUT_MS,
          () =>
            new HttpError(
              504,
              "Messenger health check timed out before Meta Graph responded.",
              "messenger_health_timeout",
            ),
        );
      } finally {
        clearTimeout(abortTimer);
      }
    });

    // Always HTTP 200 for a completed health evaluation (ok true/false in body).
    // Application-level failure must NOT use HTTP 502: proxies/CDN treat 502 as a
    // gateway error and browsers then surface CORS/"Failed to fetch" instead of JSON.
    applyApiCorsHeaders(req, res);
    res.status(200).json(report);
  } catch (error) {
    next(error);
  }
});

/**
 * Reveal the stored Messenger webhook verify token for Meta Dashboard paste.
 * Authenticated + company-scoped. Does not rotate the token. Never logs the value.
 */
router.post("/messenger/reveal-webhook-verify-token", async (req, res, next) => {
  try {
    const companyId = String(req.body?.companyId ?? "");
    if (!companyId) {
      res.status(400).json({ error: "companyId is required" });
      return;
    }

    const platform = getWebhookPlatform();
    const credentialsLoader = createSupabaseMessengerCredentialsLoader(platform.client);
    const credentials = await credentialsLoader.loadByCompanyId(companyId);
    const token = credentials?.verifyToken?.trim() ?? "";
    if (!token) {
      res.status(404).json({ error: "webhook_verify_token_not_configured" });
      return;
    }

    res.status(200).json({
      webhookVerifyToken: token,
      length: token.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * In-process verify readiness check (no token echoed). Confirms hash→channel match
 * for the stored token, including pending/disabled channels.
 */
router.post("/messenger/webhook-verify-self-check", async (req, res, next) => {
  try {
    const companyId = String(req.body?.companyId ?? "");
    if (!companyId) {
      res.status(400).json({ error: "companyId is required" });
      return;
    }

    const platform = getWebhookPlatform();
    const credentialsLoader = createSupabaseMessengerCredentialsLoader(platform.client);
    const credentials = await credentialsLoader.loadByCompanyId(companyId);
    const token = credentials?.verifyToken?.trim() ?? "";
    if (!token) {
      res.status(200).json({
        ok: false,
        reason: "webhook_verify_token_not_configured",
        matchCount: 0,
        hasVerifyToken: false,
      });
      return;
    }

    const matches = await platform.ports.registry.findCompanyChannelsByMessengerVerifyToken(token);
    const companyMatches = matches.filter((row) => row.companyId === companyId);
    const liveMessenger = companyMatches.filter((row) => row.channelKey === "messenger");
    const channel = liveMessenger[0] ?? null;

    res.status(200).json({
      ok: matches.length === 1 && companyMatches.length === 1,
      reason:
        matches.length === 1 && companyMatches.length === 1
          ? "ready"
          : matches.length === 0
            ? "match_count_zero"
            : "match_count_ambiguous",
      matchCount: matches.length,
      companyMatchCount: companyMatches.length,
      hasVerifyToken: true,
      verifyTokenLength: token.length,
      channel: channel
        ? {
            id: channel.id,
            isEnabled: channel.isEnabled,
          }
        : null,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
