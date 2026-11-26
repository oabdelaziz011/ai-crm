import type { Request, Response } from "express";
import {
  assertChannelSettingsEnabled,
  assertWebhookCompanyChannel,
  createSupabaseInstagramCredentialsLoader,
  createWebhookProcessingTrace,
  extractInstagramBusinessAccountId,
  resolveInstagramWebhookCompanyChannelId,
  summarizeInstagramWebhookPayload,
  verifyInstagramWebhookSignature,
} from "@workspace/channel-platform";
import { logger } from "../lib/logger.js";
import { getWebhookPlatform } from "../platform/create-webhook-platform.js";
import { loadPlatformEnv } from "../config/env.js";

const env = loadPlatformEnv();

function readRawBody(req: Request): string {
  return req.body instanceof Buffer
    ? req.body.toString("utf8")
    : typeof req.body === "string"
      ? req.body
      : JSON.stringify(req.body ?? {});
}

function resolveWebhookAppSecret(credentials: { appSecret?: string } | null): string | null {
  const secret = credentials?.appSecret?.trim();
  return secret || null;
}

export async function processInstagramWebhookPost(
  req: Request,
  res: Response,
  urlCompanyChannelId?: string,
): Promise<void> {
  const requestId = String(req.id ?? "");
  const trace = createWebhookProcessingTrace(
    (detail, message) => logger.info(detail, message),
    {
      requestId,
      method: req.method,
      path: req.path,
      urlCompanyChannelId: urlCompanyChannelId ?? null,
    },
  );

  const rawBody = readRawBody(req);
  let payload: Record<string, unknown>;

  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    res.status(400).json({ error: "invalid_json" });
    return;
  }

  trace.step("webhook.payload_parsed", summarizeInstagramWebhookPayload(payload));

  const instagramBusinessAccountId = extractInstagramBusinessAccountId(payload);
  const platform = getWebhookPlatform();
  const credentialsLoader = createSupabaseInstagramCredentialsLoader(platform.client);

  const routing = await resolveInstagramWebhookCompanyChannelId({
    instagramBusinessAccountId,
    urlCompanyChannelId,
    lookupByInstagramBusinessAccountId: async (lookupId) => {
      const matches = await platform.ports.registry.findCompanyChannelByInstagramBusinessAccountId(
        lookupId,
      );
      if (matches.length <= 1) {
        return matches.map((match) => ({
          id: match.id,
          companyId: match.companyId,
          channelEnabled: match.is_enabled,
        }));
      }

      const companyIds = [...new Set(matches.map((match) => match.companyId).filter(Boolean))];
      const { data: settingsRows } = await platform.client
        .from("company_instagram_settings")
        .select("company_id, enabled, connection_status, webhook_subscription_status")
        .in("company_id", companyIds);
      const settingsByCompany = new Map(
        (settingsRows ?? []).map((row) => [String((row as { company_id?: unknown }).company_id ?? ""), row]),
      );

      return matches.map((match) => {
        const settings = settingsByCompany.get(match.companyId) as
          | {
              enabled?: boolean | null;
              connection_status?: string | null;
              webhook_subscription_status?: string | null;
            }
          | undefined;
        return {
          id: match.id,
          companyId: match.companyId,
          channelEnabled: match.is_enabled,
          settingsEnabled: settings?.enabled ?? null,
          connectionStatus: settings?.connection_status ?? null,
          webhookSubscriptionStatus: settings?.webhook_subscription_status ?? null,
        };
      });
    },
  });

  if (!routing.ok) {
    if (routing.code === "duplicate_instagram_business_account") {
      res.status(409).json({
        error: "duplicate_instagram_business_account_configuration",
        instagramBusinessAccountId: routing.instagramBusinessAccountId,
        matches: routing.matches.map((match) => match.id),
      });
      return;
    }

    res.status(404).json({ error: "channel_not_found", message: routing.message });
    return;
  }

  const companyChannelId = routing.companyChannelId;
  const channel = await platform.ports.registry.getCompanyChannel(companyChannelId);

  try {
    assertWebhookCompanyChannel(channel, "instagram");
  } catch (error) {
    res.status(404).json({
      error: "channel_not_found",
      message: error instanceof Error ? error.message : "invalid_instagram_channel",
    });
    return;
  }

  const channelCredentials = await credentialsLoader.loadByCompanyId(channel.companyId);
  try {
    assertChannelSettingsEnabled(channelCredentials, "Instagram");
  } catch (error) {
    res.status(403).json({
      error: "channel_disabled",
      message: error instanceof Error ? error.message : "instagram_disabled",
    });
    return;
  }

  const appSecretForSignature = resolveWebhookAppSecret(channelCredentials);
  const requireSecret = env.webhookRequireSignature && env.nodeEnv === "production";
  const signatureValid = await verifyInstagramWebhookSignature({
    signatureHeader: req.header("x-hub-signature-256"),
    rawBody,
    appSecret: appSecretForSignature,
    requireSecret,
  });

  if (!signatureValid) {
    res.status(401).json({ error: "invalid_signature" });
    return;
  }

  try {
    const response = await platform.instagramHandler.handlePost({
      companyChannelId,
      rawPayload: payload,
      executeAi: env.webhookExecuteAi,
      requestId,
      trace,
    });

    res.status(200).json({ ok: true, response });
  } catch (error) {
    logger.error(
      { err: error, companyChannelId, routingSource: routing.source },
      "Instagram webhook processing failed",
    );
    res.status(500).json({ error: "webhook_processing_failed" });
  }
}
