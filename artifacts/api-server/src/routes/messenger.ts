import { Router, type IRouter } from "express";
import {
  createSupabaseMessengerCredentialsLoader,
  parseMessengerChannelReferences,
  performMessengerOutboundHealthCheck,
  resolveMessengerRuntimeConfiguration,
} from "@workspace/channel-platform";
import { confineToPathPrefixes } from "../middleware/confine-router-paths.js";
import { requireCompanyScope, requireSupabaseAuth } from "../middleware/supabase-auth.js";
import { getWebhookPlatform } from "../platform/create-webhook-platform.js";

const router: IRouter = Router();

// Do not run auth for unrelated paths (e.g. public /oauth/*/callback) that share the API root mount.
router.use(confineToPathPrefixes("/messenger"));
router.use(requireSupabaseAuth);
router.use(requireCompanyScope("companyId"));

router.post("/messenger/channel-outbound-health", async (req, res, next) => {
  try {
    const companyId = String(req.body?.companyId ?? "");
    const companyChannelId = String(req.body?.companyChannelId ?? "");
    if (!companyChannelId) {
      res.status(400).json({ error: "companyChannelId is required" });
      return;
    }

    const platform = getWebhookPlatform();
    const channel = await platform.ports.registry.getCompanyChannel(companyChannelId);
    if (!channel || channel.companyId !== companyId || channel.channelKey !== "messenger") {
      res.status(404).json({ error: "messenger_channel_not_found" });
      return;
    }

    const credentialsLoader = createSupabaseMessengerCredentialsLoader(platform.client);
    const runtimeConfig = await resolveMessengerRuntimeConfiguration(
      companyId,
      parseMessengerChannelReferences(channel.configuration),
      credentialsLoader,
    );

    const report = await performMessengerOutboundHealthCheck({
      companyId,
      runtimeConfig,
    });

    res.status(report.ok ? 200 : 502).json(report);
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
