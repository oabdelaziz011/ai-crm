import type { Request, Response } from "express";
import {
  assertChannelSettingsEnabled,
  assertWebhookCompanyChannel,
  createSupabaseEmailCredentialsLoader,
  createWebhookProcessingTrace,
  extractEmailRecipientAddress,
  resolveEmailWebhookCompanyChannelId,
  summarizeEmailWebhookPayload,
} from "@workspace/channel-platform";
import { logger } from "../lib/logger.js";
import { getWebhookPlatform } from "../platform/create-webhook-platform.js";
import { loadPlatformEnv } from "../config/env.js";

const env = loadPlatformEnv();

function readJsonBody(req: Request): Record<string, unknown> {
  if (req.body && typeof req.body === "object" && !(req.body instanceof Buffer)) {
    return req.body as Record<string, unknown>;
  }

  const raw =
    req.body instanceof Buffer
      ? req.body.toString("utf8")
      : typeof req.body === "string"
        ? req.body
        : "{}";

  return JSON.parse(raw) as Record<string, unknown>;
}

export async function processEmailWebhookPost(
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

  let payload: Record<string, unknown>;
  try {
    payload = readJsonBody(req);
  } catch {
    res.status(400).json({ error: "invalid_json" });
    return;
  }

  trace.step("webhook.payload_parsed", summarizeEmailWebhookPayload(payload));

  const toEmail = extractEmailRecipientAddress(payload);
  const platform = getWebhookPlatform();
  const credentialsLoader = createSupabaseEmailCredentialsLoader(platform.client);

  const routing = await resolveEmailWebhookCompanyChannelId({
    toEmail,
    urlCompanyChannelId,
    lookupByToEmail: async (lookupEmail) => {
      const matches = await platform.ports.registry.findCompanyChannelByFromEmail(lookupEmail);
      return matches.map((match) => ({ id: match.id, companyId: match.companyId }));
    },
  });

  if (!routing.ok) {
    if (routing.code === "duplicate_to_email") {
      res.status(409).json({
        error: "duplicate_from_email_configuration",
        toEmail,
        matches: routing.matches?.map((match) => match.id),
      });
      return;
    }

    res.status(404).json({ error: "channel_not_found", message: routing.message });
    return;
  }

  const companyChannelId = routing.companyChannelId;
  const channel = await platform.ports.registry.getCompanyChannel(companyChannelId);

  try {
    assertWebhookCompanyChannel(channel, "email");
  } catch (error) {
    res.status(404).json({
      error: "channel_not_found",
      message: error instanceof Error ? error.message : "invalid_email_channel",
    });
    return;
  }

  const channelCredentials = await credentialsLoader.loadByCompanyId(channel.companyId);
  try {
    assertChannelSettingsEnabled(
      channelCredentials?.conversationEnabled ? { enabled: true } : null,
      "Email",
    );
  } catch (error) {
    res.status(403).json({
      error: "channel_disabled",
      message: error instanceof Error ? error.message : "email_disabled",
    });
    return;
  }

  try {
    const response = await platform.emailHandler.handlePost({
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
      "Email webhook processing failed",
    );
    res.status(500).json({ error: "webhook_processing_failed" });
  }
}
