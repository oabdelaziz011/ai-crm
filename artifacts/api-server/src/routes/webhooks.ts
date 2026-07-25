import { Router, type IRouter, type Request, type Response } from "express";
import {
  createWebhookDiagnosticLogger,
  createWebhookProcessingTrace,
  extractWhatsAppPhoneNumberId,
  previewRawBody,
  probeWhatsAppPhoneNumberChannel,
  resolveWhatsAppWebhookCompanyChannelId,
  summarizeWebhookHeaders,
  summarizeWhatsAppWebhookPayload,
  verifyWhatsAppWebhookSignature,
} from "@workspace/channel-platform";
import { logger } from "../lib/logger.js";
import { webhookRateLimiter } from "../middleware/rate-limit.js";
import { getWebhookPlatform } from "../platform/create-webhook-platform.js";
import { loadPlatformEnv } from "../config/env.js";

const router: IRouter = Router();
const env = loadPlatformEnv();

function logDiag(stage: string, detail: Record<string, unknown> = {}): void {
  createWebhookDiagnosticLogger((payload, message) => logger.info(payload, message))({
    stage,
    detail,
  });
}

function routeParam(value: string | string[]): string {
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

function readRawBody(req: Request): string {
  return req.body instanceof Buffer
    ? req.body.toString("utf8")
    : typeof req.body === "string"
      ? req.body
      : JSON.stringify(req.body ?? {});
}

function readAppSecret(configuration: Record<string, unknown>): string | null {
  if (typeof configuration.appSecret === "string") return configuration.appSecret;
  if (typeof configuration.app_secret === "string") return configuration.app_secret;
  return null;
}

router.use(webhookRateLimiter);

router.use((req, _res, next) => {
  if (req.method === "POST") {
    logDiag("ingress.router.entered", {
      method: req.method,
      path: req.path,
      originalUrl: req.originalUrl,
      bodyType: req.body instanceof Buffer ? "buffer" : typeof req.body,
      bodyByteLength: req.body instanceof Buffer ? req.body.length : null,
    });
  }
  next();
});

router.get("/whatsapp", async (req: Request, res: Response) => {
  try {
    const platform = getWebhookPlatform();
    const result = await platform.whatsAppHandler.verifyGetByVerifyToken(req.query);
    res.status(result.status).send(result.body);
  } catch (error) {
    logger.error({ err: error }, "WhatsApp production webhook verification failed");
    res.status(403).send("Forbidden");
  }
});

router.get("/whatsapp/:companyChannelId", async (req: Request, res: Response) => {
  try {
    const platform = getWebhookPlatform();
    const result = await platform.whatsAppHandler.verifyGet({
      companyChannelId: routeParam(req.params.companyChannelId),
      ...req.query,
    });
    res.status(result.status).send(result.body);
  } catch (error) {
    logger.error({ err: error }, "WhatsApp webhook verification failed");
    res.status(403).send("Forbidden");
  }
});

async function processWhatsAppWebhookPost(
  req: Request,
  res: Response,
  urlCompanyChannelId?: string,
): Promise<void> {
  const requestId = String(req.id ?? "");
  const diag = (stage: string, detail: Record<string, unknown> = {}) =>
    logDiag(stage, { requestId, ...detail });

  const trace = createWebhookProcessingTrace(
    (detail, message) => logger.info(detail, message),
    {
      requestId,
      method: req.method,
      path: req.path,
      urlCompanyChannelId: urlCompanyChannelId ?? null,
    },
  );

  diag("post.process_started", {
    path: req.path,
    urlCompanyChannelId: urlCompanyChannelId ?? null,
    headers: summarizeWebhookHeaders(req.headers as Record<string, unknown>),
  });

  trace.step("webhook.received", {
    contentType: req.header("content-type") ?? null,
    contentLength: req.header("content-length") ?? null,
    hasSignatureHeader: Boolean(req.header("x-hub-signature-256")),
  });

  const rawBody = readRawBody(req);
  diag("post.raw_body_read", {
    rawBodyLength: rawBody.length,
    rawBodyPreview: previewRawBody(rawBody),
    bodyWasBuffer: req.body instanceof Buffer,
  });

  let payload: Record<string, unknown>;

  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch (error) {
    const parseError = error instanceof Error ? error.message : "invalid_json";
    diag("post.early_return", {
      httpStatus: 400,
      reason: "invalid_json",
      error: parseError,
    });
    trace.step("webhook.processing_failed", {
      stage: "payload_parse",
      error: parseError,
    });
    trace.step("webhook.diag_early_return", { httpStatus: 400, reason: "invalid_json" });
    res.status(400).json({ error: "invalid_json" });
    return;
  }

  const payloadSummary = summarizeWhatsAppWebhookPayload(payload);
  diag("post.payload_parsed", payloadSummary);
  trace.step("webhook.payload_parsed", payloadSummary);

  const phoneNumberId = extractWhatsAppPhoneNumberId(payload);
  diag("post.phone_number_id_extracted", {
    phoneNumberId,
    extractedFromSummary: payloadSummary.phoneNumberId,
  });
  trace.step("webhook.phone_number_extracted", { phoneNumberId });

  const platform = getWebhookPlatform();

  const routing = await resolveWhatsAppWebhookCompanyChannelId({
    phoneNumberId,
    urlCompanyChannelId,
    diagnose: (stage, detail) => diag(`routing.${stage}`, detail ?? {}),
    lookupByPhoneNumberId: async (lookupPhoneNumberId) => {
      diag("routing.db_lookup.start", { lookupPhoneNumberId });
      const matches = await platform.ports.registry.findCompanyChannelByPhoneNumberId(
        lookupPhoneNumberId,
      );
      diag("routing.db_lookup.result", {
        lookupPhoneNumberId,
        matchCount: matches.length,
        matches: matches.map((match) => ({
          id: match.id,
          companyId: match.companyId,
          isEnabled: match.isEnabled,
          configuredPhoneNumberId: match.configuration.phoneNumberId ?? null,
        })),
      });
      return matches.map((match) => ({ id: match.id, companyId: match.companyId }));
    },
    lookupByCredentialProbe: phoneNumberId
      ? async (lookupPhoneNumberId) => {
          const channels = await platform.ports.registry.listEnabledWhatsAppChannels();
          trace.step("webhook.routing_resolved", {
            stage: "credential_probe_started",
            candidateChannelCount: channels.length,
            lookupPhoneNumberId,
          });

          const probed = await probeWhatsAppPhoneNumberChannel(
            lookupPhoneNumberId,
            channels.map((channel) => ({
              id: channel.id,
              companyId: channel.companyId,
              configuration: channel.configuration,
            })),
          );

          if (!probed) return null;

          return { id: probed.id, companyId: probed.companyId };
        }
      : undefined,
    onPhoneNumberIdReconciled: async ({ companyChannelId, phoneNumberId: reconciledPhoneNumberId }) => {
      const channel = await platform.ports.registry.getCompanyChannel(companyChannelId);
      const previousPhoneNumberId =
        typeof channel?.configuration.phoneNumberId === "string"
          ? channel.configuration.phoneNumberId
          : null;

      await platform.ports.registry.syncWhatsAppPhoneNumberId(
        companyChannelId,
        reconciledPhoneNumberId,
      );

      trace.step("webhook.routing_resolved", {
        stage: "phone_number_id_reconciled",
        companyChannelId,
        previousPhoneNumberId,
        phoneNumberId: reconciledPhoneNumberId,
      });

      logger.warn(
        {
          requestId,
          companyChannelId,
          previousPhoneNumberId,
          phoneNumberId: reconciledPhoneNumberId,
        },
        "WhatsApp phone number ID reconciled from inbound webhook metadata",
      );
    },
  });

  if (!routing.ok) {
    trace.step("webhook.routing_failed", {
      code: routing.code,
      phoneNumberId,
      message: routing.code === "no_channel" ? routing.message : undefined,
      matchCount: routing.code === "duplicate_phone_number" ? routing.matches.length : 0,
    });

    if (routing.code === "duplicate_phone_number") {
      diag("post.early_return", {
        httpStatus: 409,
        reason: "duplicate_phone_number_configuration",
        phoneNumberId: routing.phoneNumberId,
        matchCount: routing.matches.length,
      });
      trace.step("webhook.diag_early_return", {
        httpStatus: 409,
        reason: "duplicate_phone_number_configuration",
      });
      logger.error(
        {
          phoneNumberId: routing.phoneNumberId,
          matches: routing.matches.map((match) => ({
            companyChannelId: match.id,
            companyId: match.companyId,
          })),
        },
        "Duplicate WhatsApp phone number configuration rejected inbound webhook",
      );
      res.status(409).json({
        error: "duplicate_phone_number_configuration",
        phoneNumberId: routing.phoneNumberId,
        matches: routing.matches.map((match) => match.id),
      });
      return;
    }

    diag("post.early_return", {
      httpStatus: 404,
      reason: "channel_not_found",
      routingCode: routing.code,
      phoneNumberId,
      urlCompanyChannelId: urlCompanyChannelId ?? null,
      message: routing.message,
    });
    trace.step("webhook.diag_early_return", {
      httpStatus: 404,
      reason: "channel_not_found",
      routingCode: routing.code,
    });
    logger.warn(
      { phoneNumberId, urlCompanyChannelId, message: routing.message },
      "WhatsApp webhook could not be routed to a company channel",
    );
    res.status(404).json({ error: "channel_not_found", message: routing.message });
    return;
  }

  const companyChannelId = routing.companyChannelId;
  trace.step("webhook.routing_resolved", {
    companyChannelId,
    routingSource: routing.source,
    phoneNumberId,
  });

  if (routing.source === "phone_number" && urlCompanyChannelId && urlCompanyChannelId !== companyChannelId) {
    logger.info(
      {
        phoneNumberId,
        urlCompanyChannelId,
        resolvedCompanyChannelId: companyChannelId,
      },
      "WhatsApp inbound routed by phone number instead of legacy URL channel id",
    );
  }

  diag("post.routing_resolved", {
    companyChannelId,
    routingSource: routing.source,
    phoneNumberId,
  });

  const channel = await platform.ports.registry.getCompanyChannel(companyChannelId);
  diag("post.channel_lookup", {
    companyChannelId,
    found: Boolean(channel),
    isEnabled: channel?.isEnabled ?? null,
    channelKey: channel?.channelKey ?? null,
    configuredPhoneNumberId:
      typeof channel?.configuration.phoneNumberId === "string"
        ? channel.configuration.phoneNumberId
        : null,
    hasAppSecret: Boolean(channel && readAppSecret(channel.configuration)),
  });

  if (!channel) {
    diag("post.early_return", {
      httpStatus: 404,
      reason: "channel_not_found",
      stage: "channel_lookup_after_routing",
      companyChannelId,
    });
    trace.step("webhook.processing_failed", { stage: "channel_lookup", companyChannelId });
    trace.step("webhook.diag_early_return", {
      httpStatus: 404,
      reason: "channel_not_found",
      stage: "channel_lookup_after_routing",
    });
    res.status(404).json({ error: "channel_not_found" });
    return;
  }

  const appSecret = readAppSecret(channel.configuration);
  const requireSecret = env.webhookRequireSignature && env.nodeEnv === "production";
  const signatureHeader = req.header("x-hub-signature-256");

  diag("post.signature_verification.start", {
    companyChannelId,
    requireSecret,
    nodeEnv: env.nodeEnv,
    hasAppSecret: Boolean(appSecret),
    hasSignatureHeader: Boolean(signatureHeader),
    signatureHeaderPrefix: signatureHeader?.slice(0, 12) ?? null,
  });

  const signatureValid = await verifyWhatsAppWebhookSignature({
    signatureHeader,
    rawBody,
    appSecret,
    requireSecret,
  });

  diag("post.signature_verification.result", {
    companyChannelId,
    signatureValid,
    skippedBecauseNoSecret: !appSecret && !requireSecret,
  });

  if (!signatureValid) {
    diag("post.early_return", {
      httpStatus: 401,
      reason: "invalid_signature",
      companyChannelId,
      requireSecret,
      hasAppSecret: Boolean(appSecret),
      hasSignatureHeader: Boolean(signatureHeader),
    });
    trace.step("webhook.signature_rejected", { companyChannelId });
    trace.step("webhook.diag_early_return", { httpStatus: 401, reason: "invalid_signature" });
    res.status(401).json({ error: "invalid_signature" });
    return;
  }

  trace.step("webhook.signature_verified", { companyChannelId });

  try {
    diag("post.handler_invoke.start", {
      companyChannelId,
      executeAi: env.webhookExecuteAi,
    });
    trace.step("webhook.handler_started", { companyChannelId, executeAi: env.webhookExecuteAi });

    const response = await platform.whatsAppHandler.handlePost({
      companyChannelId,
      rawPayload: payload,
      executeAi: env.webhookExecuteAi,
      requestId,
      trace,
    });

    diag("post.handler_invoke.completed", {
      companyChannelId,
      responseKind: response.kind,
      automationRunId:
        response.kind === "inbound" ? response.result.automationRunId ?? null : null,
      runtimeExecutionId:
        response.kind === "inbound" ? response.result.runtimeExecutionId ?? null : null,
      outboundDeliveryId:
        response.kind === "inbound" ? response.result.outboundDeliveryId ?? null : null,
    });

    trace.step("webhook.processing_completed", {
      companyChannelId,
      responseKind: response.kind,
      automationRunId:
        response.kind === "inbound" ? response.result.automationRunId ?? null : null,
      outboundDeliveryId:
        response.kind === "inbound" ? response.result.outboundDeliveryId ?? null : null,
    });

    res.status(200).json({ ok: true, response });
  } catch (error) {
    const handlerError = error instanceof Error ? error.message : "webhook_processing_failed";
    diag("post.early_return", {
      httpStatus: 500,
      reason: "webhook_processing_failed",
      companyChannelId,
      stage: "handler",
      error: handlerError,
    });
    trace.step("webhook.processing_failed", {
      companyChannelId,
      stage: "handler",
      error: handlerError,
    });
    trace.step("webhook.diag_early_return", {
      httpStatus: 500,
      reason: "webhook_processing_failed",
      stage: "handler",
    });
    logger.error(
      { err: error, companyChannelId, routingSource: routing.source },
      "WhatsApp webhook processing failed",
    );
    res.status(500).json({ error: "webhook_processing_failed" });
  }
}

router.post("/whatsapp", async (req: Request, res: Response) => {
  logDiag("post.route.matched", { route: "POST /whatsapp" });
  await processWhatsAppWebhookPost(req, res);
});

router.post("/whatsapp/:companyChannelId", async (req: Request, res: Response) => {
  const companyChannelId = routeParam(req.params.companyChannelId);
  logDiag("post.route.matched", { route: "POST /whatsapp/:companyChannelId", companyChannelId });
  await processWhatsAppWebhookPost(req, res, companyChannelId);
});

export default router;
