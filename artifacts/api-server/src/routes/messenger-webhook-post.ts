import type { Request, Response } from "express";
import {
  assertChannelSettingsEnabled,
  assertWebhookCompanyChannel,
  createSupabaseMessengerCredentialsLoader,
  createWebhookProcessingTrace,
  extractMessengerPageId,
  resolveMessengerWebhookCompanyChannelId,
  summarizeMessengerWebhookPayload,
  verifyMessengerWebhookSignature,
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

export async function processMessengerWebhookPost(
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

  trace.step("webhook.payload_parsed", summarizeMessengerWebhookPayload(payload));

  const pageId = extractMessengerPageId(payload);
  const platform = getWebhookPlatform();
  const credentialsLoader = createSupabaseMessengerCredentialsLoader(platform.client);

  const routing = await resolveMessengerWebhookCompanyChannelId({
    pageId,
    urlCompanyChannelId,
    lookupByPageId: async (lookupId) => {
      const matches = await platform.ports.registry.findCompanyChannelByMessengerPageId(lookupId);
      return matches.map((match) => ({ id: match.id, companyId: match.companyId }));
    },
  });

  if (!routing.ok) {
    if (routing.code === "duplicate_page_id") {
      res.status(409).json({
        error: "duplicate_page_id_configuration",
        pageId: routing.pageId,
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
    assertWebhookCompanyChannel(channel, "messenger");
  } catch (error) {
    res.status(404).json({
      error: "channel_not_found",
      message: error instanceof Error ? error.message : "invalid_messenger_channel",
    });
    return;
  }

  const channelCredentials = await credentialsLoader.loadByCompanyId(channel.companyId);
  try {
    assertChannelSettingsEnabled(channelCredentials, "Messenger");
  } catch (error) {
    res.status(403).json({
      error: "channel_disabled",
      message: error instanceof Error ? error.message : "messenger_disabled",
    });
    return;
  }

  const appSecretForSignature = resolveWebhookAppSecret(channelCredentials);
  const requireSecret = env.webhookRequireSignature && env.nodeEnv === "production";
  const signatureValid = await verifyMessengerWebhookSignature({
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
    const response = await platform.messengerHandler.handlePost({
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
      "Messenger webhook processing failed",
    );
    res.status(500).json({ error: "webhook_processing_failed" });
  }
}
