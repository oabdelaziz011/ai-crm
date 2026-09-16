import type { Request, Response } from "express";
import {
  createWebhookProcessingTrace,
  flattenTwilioFormParams,
  resolveSmsCompanyChannel,
  resolveSmsCompanyChannelIdByToNumber,
  resolveTwilioWebhookValidationUrl,
  verifyTwilioRequestSignature,
  createSupabaseSmsCredentialsLoader,
} from "@workspace/channel-platform";
import { logger } from "../lib/logger.js";
import { getWebhookPlatform } from "../platform/create-webhook-platform.js";

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function readFormBody(req: Request): Record<string, unknown> {
  if (req.body && typeof req.body === "object" && !(req.body instanceof Buffer)) {
    return req.body as Record<string, unknown>;
  }
  if (req.body instanceof Buffer) {
    const text = req.body.toString("utf8");
    const params = new URLSearchParams(text);
    const out: Record<string, unknown> = {};
    for (const [key, value] of params.entries()) {
      out[key] = value;
    }
    return out;
  }
  if (typeof req.body === "string") {
    const params = new URLSearchParams(req.body);
    const out: Record<string, unknown> = {};
    for (const [key, value] of params.entries()) {
      out[key] = value;
    }
    return out;
  }
  return {};
}

/**
 * POST /api/webhooks/sms[/:companyChannelId]
 * Twilio form-urlencoded inbound + status callbacks.
 */
export async function processSmsWebhookPost(req: Request, res: Response): Promise<void> {
  const platform = getWebhookPlatform();
  const credentialsLoader = createSupabaseSmsCredentialsLoader(platform.client);
  const rawPayload = readFormBody(req);
  const params = flattenTwilioFormParams(rawPayload);
  const signature = req.header("X-Twilio-Signature");

  let companyChannelId = routeParam(req.params.companyChannelId).trim();
  if (!companyChannelId) {
    const toNumber = String(params.To ?? "").trim();
    companyChannelId =
      (await resolveSmsCompanyChannelIdByToNumber(platform.client, toNumber)) ?? "";
  }

  if (!companyChannelId) {
    res.status(404).json({ error: "sms_channel_not_found" });
    return;
  }

  let authToken: string;
  try {
    const resolved = await resolveSmsCompanyChannel(
      platform.ports,
      companyChannelId,
      credentialsLoader,
    );
    authToken = resolved.authToken;
  } catch (error) {
    const message = error instanceof Error ? error.message : "SMS channel unavailable";
    logger.warn(
      { companyChannelId, error: message, event: "sms.webhook.resolve_failed" },
      "SMS webhook channel resolve failed",
    );
    res.status(403).json({ error: "sms_channel_disabled_or_missing" });
    return;
  }

  let validationUrl: string;
  try {
    validationUrl = resolveTwilioWebhookValidationUrl({
      publicBaseUrl:
        process.env.VITE_WEBHOOK_BASE_URL ||
        process.env.PUBLIC_WEBHOOK_BASE_URL ||
        process.env.VITE_API_SERVER_URL,
      requestProtocol: req.protocol,
      requestHost: req.get("host"),
      originalUrl: req.originalUrl,
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), event: "sms.webhook.url" },
      "SMS webhook validation URL unresolved",
    );
    res.status(500).json({ error: "sms_webhook_url_unresolved" });
    return;
  }

  const signatureOk = verifyTwilioRequestSignature({
    authToken,
    signatureHeader: signature,
    url: validationUrl,
    params,
  });

  if (!signatureOk) {
    logger.warn(
      {
        companyChannelId,
        event: "sms.webhook.signature_invalid",
        // Never log auth token.
        hasSignature: Boolean(signature),
      },
      "SMS webhook signature rejected",
    );
    res.status(403).json({ error: "invalid_signature" });
    return;
  }

  const trace = createWebhookProcessingTrace({
    channelKey: "sms",
    companyChannelId,
    requestId: req.requestId ?? null,
  });

  const result = await platform.smsHandler.handlePost({
    companyChannelId,
    rawPayload,
    requestId: req.requestId ?? null,
    trace,
  });

  res.status(result.status).json(result.body);
}
