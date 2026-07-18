import { Router, type IRouter, type Request, type Response } from "express";
import { verifyWhatsAppWebhookSignature } from "@workspace/channel-platform";
import { logger } from "../lib/logger.js";
import { webhookRateLimiter } from "../middleware/rate-limit.js";
import { getWebhookPlatform } from "../platform/create-webhook-platform.js";
import { loadPlatformEnv } from "../config/env.js";

const router: IRouter = Router();
const env = loadPlatformEnv();

router.use(webhookRateLimiter);

router.get("/whatsapp/:companyChannelId", async (req: Request, res: Response) => {
  try {
    const platform = getWebhookPlatform();
    const result = await platform.whatsAppHandler.verifyGet({
      companyChannelId: req.params.companyChannelId,
      ...req.query,
    });
    res.status(result.status).send(result.body);
  } catch (error) {
    logger.error({ err: error }, "WhatsApp webhook verification failed");
    res.status(403).send("Forbidden");
  }
});

router.post("/whatsapp/:companyChannelId", async (req: Request, res: Response) => {
  const companyChannelId = req.params.companyChannelId;
  const rawBody =
    req.body instanceof Buffer
      ? req.body.toString("utf8")
      : typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body ?? {});

  try {
    const platform = getWebhookPlatform();
    const channel = await platform.ports.registry.getCompanyChannel(companyChannelId);
    if (!channel) {
      res.status(404).json({ error: "channel_not_found" });
      return;
    }

    const appSecret =
      typeof channel.configuration.appSecret === "string"
        ? channel.configuration.appSecret
        : typeof channel.configuration.app_secret === "string"
          ? channel.configuration.app_secret
          : null;

    const signatureValid = await verifyWhatsAppWebhookSignature({
      signatureHeader: req.header("x-hub-signature-256"),
      rawBody,
      appSecret,
      requireSecret: env.webhookRequireSignature && env.nodeEnv === "production",
    });

    if (!signatureValid) {
      res.status(401).json({ error: "invalid_signature" });
      return;
    }

    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const response = await platform.whatsAppHandler.handlePost({
      companyChannelId,
      rawPayload: payload,
      executeAi: env.webhookExecuteAi,
    });

    res.status(200).json({ ok: true, response });
  } catch (error) {
    logger.error({ err: error, companyChannelId }, "WhatsApp webhook processing failed");
    res.status(500).json({ error: "webhook_processing_failed" });
  }
});

export default router;
