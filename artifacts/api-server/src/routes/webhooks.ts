import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  createWebhookDiagnosticLogger,
  createWebhookProcessingTrace,
  createSupabaseWhatsAppCredentialsLoader,
  extractWhatsAppPhoneNumberId,
  previewRawBody,
  probeWhatsAppPhoneNumberChannel,
  resolveWhatsAppWebhookCompanyChannelId,
  summarizeWebhookHeaders,
  summarizeWhatsAppWebhookPayload,
  verifyWhatsAppWebhookSignature,
} from "@workspace/channel-platform";
import {
  installWhatsAppConversationTraceApi,
  runWithWhatsAppConversationTrace,
  runWithWhatsAppPipelineProfiler,
  runWithWhatsAppRequestCache,
  setWhatsAppConversationTrace,
  setWhatsAppPipelineProfiler,
  setWhatsAppRequestCache,
  WhatsAppConversationTrace,
  WhatsAppPipelineProfiler,
  WhatsAppRequestCache,
} from "@workspace/channel-platform/server";
import { logger } from "../lib/logger.js";
import { webhookRateLimiter } from "../middleware/rate-limit.js";
import { getWebhookPlatform } from "../platform/create-webhook-platform.js";
import { loadPlatformEnv } from "../config/env.js";
import { processInstagramWebhookPost } from "./instagram-webhook-post.js";
import { processMessengerWebhookPost } from "./messenger-webhook-post.js";
import { processEmailWebhookPost } from "./email-channel-webhook-post.js";

/** Sprint 2.3 A/B measurement: project-root `.workflow-request-memo` → WORKFLOW_REQUEST_MEMO. */
function syncWorkflowRequestMemoFlag(): void {
  try {
    const candidates = [
      resolve(process.cwd(), ".workflow-request-memo"),
      resolve(process.cwd(), "../../.workflow-request-memo"),
    ];
    for (const path of candidates) {
      if (!existsSync(path)) continue;
      const raw = readFileSync(path, "utf8").trim();
      if (raw === "0" || raw === "1") {
        process.env.WORKFLOW_REQUEST_MEMO = raw;
      }
      return;
    }
  } catch {
    // ignore
  }
}

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

function resolveWebhookAppSecret(credentials: { appSecret?: string } | null): string | null {
  const secret = credentials?.appSecret?.trim();
  return secret || null;
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
  console.log("[WHATSAPP] Verification request", {
    path: req.path,
    mode: req.query["hub.mode"] ?? null,
    hasVerifyToken: Boolean(req.query["hub.verify_token"]),
    hasChallenge: Boolean(req.query["hub.challenge"]),
  });
  try {
    const platform = getWebhookPlatform();
    const result = await platform.whatsAppHandler.verifyGetByVerifyToken(req.query);
    console.log("[WHATSAPP] Verification request", {
      path: req.path,
      status: result.status,
      ok: result.status === 200,
    });
    res.status(result.status).send(result.body);
  } catch (error) {
    console.error("[ERROR] WhatsApp verification failed", error);
    if (error instanceof Error && error.stack) console.error(error.stack);
    logger.error({ err: error }, "WhatsApp production webhook verification failed");
    res.status(403).send("Forbidden");
  }
});

router.get("/whatsapp/:companyChannelId", async (req: Request, res: Response) => {
  console.log("[WHATSAPP] Verification request", {
    path: req.path,
    companyChannelId: routeParam(req.params.companyChannelId),
    mode: req.query["hub.mode"] ?? null,
    hasVerifyToken: Boolean(req.query["hub.verify_token"]),
    hasChallenge: Boolean(req.query["hub.challenge"]),
  });
  try {
    const platform = getWebhookPlatform();
    const result = await platform.whatsAppHandler.verifyGet({
      companyChannelId: routeParam(req.params.companyChannelId),
      ...req.query,
    });
    console.log("[WHATSAPP] Verification request", {
      path: req.path,
      companyChannelId: routeParam(req.params.companyChannelId),
      status: result.status,
      ok: result.status === 200,
    });
    res.status(result.status).send(result.body);
  } catch (error) {
    console.error("[ERROR] WhatsApp verification failed", error);
    if (error instanceof Error && error.stack) console.error(error.stack);
    logger.error({ err: error }, "WhatsApp webhook verification failed");
    res.status(403).send("Forbidden");
  }
});

async function processWhatsAppWebhookPost(
  req: Request,
  res: Response,
  urlCompanyChannelId?: string,
): Promise<void> {
  syncWorkflowRequestMemoFlag();
  installWhatsAppConversationTraceApi();
  const requestId = String(req.id ?? "");
  const pipelineStartedAt = Date.now();
  // Profiler is armed only for inbound user messages (not delivery/read status).
  let perf: WhatsAppPipelineProfiler | null = null;
  // Request-scoped dedupe for company/channel/credentials/runtime/session/conversation.
  let requestCache: WhatsAppRequestCache | null = null;
  // Sprint 2.4: one TRACE per inbound WhatsApp message (not for status-only callbacks).
  let conversationTrace: WhatsAppConversationTrace | null = null;
  console.log("[WHATSAPP] Incoming webhook received", {
    requestId,
    path: req.path,
    method: req.method,
    urlCompanyChannelId: urlCompanyChannelId ?? null,
    contentType: req.header("content-type") ?? null,
    hasSignatureHeader: Boolean(req.header("x-hub-signature-256")),
  });
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

  try {
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

  const inboundMessageCount = Number(payloadSummary.messageCount ?? 0);
  const statusCount = Number(payloadSummary.statusCount ?? 0);
  const isInboundUserMessage = inboundMessageCount > 0;
  const isStatusOnly = !isInboundUserMessage && statusCount > 0;

  if (isStatusOnly) {
    trace.step("webhook.diag", {
      stage: "status_only_callback",
      note: "Payload contains delivery/read status updates only — no inbound user message or workflow execution. Perf profiling skipped.",
      statusCount,
    });
  }

  // Arm profiler only for inbound user messages (AI/workflow path).
  if (isInboundUserMessage) {
    perf = new WhatsAppPipelineProfiler(requestId);
    setWhatsAppPipelineProfiler(perf);
    perf.mark("Webhook receive", Date.now() - pipelineStartedAt, {
      rawBodyLength: rawBody.length,
      messageCount: inboundMessageCount,
    });
    perf.start("Webhook validation");
    conversationTrace = new WhatsAppConversationTrace(requestId || `wa-trace-${Date.now()}`);
  }

  // Dedupe company/channel/credentials/runtime/session loads for this webhook only.
  requestCache = new WhatsAppRequestCache(requestId);
  const runCachedWebhook = () =>
    runWithWhatsAppRequestCache(requestCache!, async () => {
  const phoneNumberId = extractWhatsAppPhoneNumberId(payload);
  diag("post.phone_number_id_extracted", {
    phoneNumberId,
    extractedFromSummary: payloadSummary.phoneNumberId,
  });
  trace.step("webhook.phone_number_extracted", { phoneNumberId });

  const platform = getWebhookPlatform();
  const credentialsLoader = createSupabaseWhatsAppCredentialsLoader(platform.client, {
    onDiagnostic: (detail) =>
      logger.info({ ...detail, event: "whatsapp.credentials" }, "WhatsApp credentials load"),
  });

  perf?.start("Company lookup");
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
            {
              loadAccessToken: async (companyId) =>
                (await credentialsLoader.loadByCompanyId(companyId))?.accessToken ?? null,
              loadApiVersion: async (companyId) =>
                (await credentialsLoader.loadByCompanyId(companyId))?.apiVersion ?? null,
            },
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
      perf?.end("Company lookup", { error: "duplicate_phone_number" });
      perf?.end("Webhook validation", { error: "duplicate_phone_number" });
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
    perf?.end("Company lookup", { error: "channel_not_found" });
    perf?.end("Webhook validation", { error: "channel_not_found" });
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
    console.error("[ERROR] WhatsApp company channel lookup failed after routing", {
      requestId,
      companyChannelId,
      phoneNumberId,
      executionTimeMs: Date.now() - pipelineStartedAt,
    });
    perf?.end("Company lookup", { error: "channel_not_found_after_routing" });
    perf?.end("Webhook validation", { error: "channel_not_found_after_routing" });
    res.status(404).json({ error: "channel_not_found" });
    return;
  }

  console.log("[WHATSAPP] Company resolved", {
    requestId,
    companyId: channel.companyId,
    companyChannelId,
    phoneNumberId,
    routingSource: routing.source,
    isEnabled: channel.isEnabled,
  });
  perf?.end("Company lookup", {
    companyId: channel.companyId,
    companyChannelId,
    routingSource: routing.source,
  });

  const credentialsStartedAt = Date.now();
  const channelCredentials = await credentialsLoader.loadByCompanyId(channel.companyId);
  perf?.mark("Database writes: load WhatsApp credentials", Date.now() - credentialsStartedAt, {
    companyId: channel.companyId,
  });
  const appSecretForSignature = resolveWebhookAppSecret(channelCredentials);

  diag("post.channel_lookup", {
    companyChannelId,
    found: true,
    isEnabled: channel.isEnabled,
    channelKey: channel.channelKey,
    configuredPhoneNumberId:
      typeof channel.configuration.phoneNumberId === "string"
        ? channel.configuration.phoneNumberId
        : null,
    hasAppSecret: Boolean(appSecretForSignature),
  });

  const requireSecret = env.webhookRequireSignature && env.nodeEnv === "production";
  const signatureHeader = req.header("x-hub-signature-256");

  diag("post.signature_verification.start", {
    companyChannelId,
    requireSecret,
    nodeEnv: env.nodeEnv,
    hasAppSecret: Boolean(appSecretForSignature),
    hasSignatureHeader: Boolean(signatureHeader),
    signatureHeaderPrefix: signatureHeader?.slice(0, 12) ?? null,
  });

  const signatureValid = await verifyWhatsAppWebhookSignature({
    signatureHeader,
    rawBody,
    appSecret: appSecretForSignature,
    requireSecret,
  });

  diag("post.signature_verification.result", {
    companyChannelId,
    signatureValid,
    skippedBecauseNoSecret: !appSecretForSignature && !requireSecret,
  });

  if (!signatureValid) {
    diag("post.early_return", {
      httpStatus: 401,
      reason: "invalid_signature",
      companyChannelId,
      requireSecret,
      hasAppSecret: Boolean(appSecretForSignature),
      hasSignatureHeader: Boolean(signatureHeader),
    });
    trace.step("webhook.signature_rejected", { companyChannelId });
    trace.step("webhook.diag_early_return", { httpStatus: 401, reason: "invalid_signature" });
    perf?.end("Webhook validation", { error: "invalid_signature" });
    res.status(401).json({ error: "invalid_signature" });
    return;
  }

  perf?.end("Webhook validation", { signatureValid: true });
  trace.step("webhook.signature_verified", { companyChannelId });

  try {
    diag("post.handler_invoke.start", {
      companyChannelId,
      executeAi: env.webhookExecuteAi,
    });
    trace.step("webhook.handler_started", { companyChannelId, executeAi: env.webhookExecuteAi });

    // Keep profiler request-scoped across concurrent delivery-status webhooks.
    const invokeHandler = () =>
      platform.whatsAppHandler.handlePost({
        companyChannelId,
        rawPayload: payload,
        executeAi: env.webhookExecuteAi,
        requestId,
        trace,
      });
    const response = perf
      ? await runWithWhatsAppPipelineProfiler(perf, invokeHandler)
      : await invokeHandler();

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

    console.log("[WHATSAPP] Reply completed", {
      requestId,
      companyId: channel.companyId,
      companyChannelId,
      conversationId: response.kind === "inbound" ? response.result.conversationId ?? null : null,
      runtimeExecutionId:
        response.kind === "inbound" ? response.result.runtimeExecutionId ?? null : null,
      outboundDeliveryId:
        response.kind === "inbound" ? response.result.outboundDeliveryId ?? null : null,
      responseKind: response.kind,
      executionTimeMs: Date.now() - pipelineStartedAt,
    });

    if (
      response.kind === "inbound" &&
      (response.result.automationRunId || response.result.runtimeExecutionId)
    ) {
      perf?.markInboundExecution(
        response.result.automationRunId ? "workflow" : "ai_runtime",
      );
    }

    res.status(200).json({ ok: true, response });
  } catch (error) {
    const handlerError = error instanceof Error ? error.message : "webhook_processing_failed";
    conversationTrace?.noteError(handlerError);
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
    console.error("[ERROR] WhatsApp webhook processing failed", {
      requestId,
      companyId: channel.companyId,
      companyChannelId,
      phoneNumberId,
      executionTimeMs: Date.now() - pipelineStartedAt,
      error: handlerError,
    });
    if (error instanceof Error && error.stack) console.error(error.stack);
    logger.error(
      { err: error, companyChannelId, routingSource: routing.source },
      "WhatsApp webhook processing failed",
    );
    res.status(500).json({ error: "webhook_processing_failed" });
  }
  }); // runWithWhatsAppRequestCache

  if (conversationTrace) {
    await runWithWhatsAppConversationTrace(conversationTrace, runCachedWebhook);
  } else {
    await runCachedWebhook();
  }
  } finally {
    // Status/read/delivery webhooks never arm `perf`. Inbound reports print only when
    // AI/workflow execution actually ran (see markInboundExecution / stage prefixes).
    perf?.printInboundReport({
      path: req.path,
      urlCompanyChannelId: urlCompanyChannelId ?? null,
    });
    if (perf?.hasInboundExecution() && requestCache) {
      requestCache.printOptimizationReport(
        Date.now() - pipelineStartedAt,
        perf.getMetaSendTotalMs(),
      );
    }
    // Sprint 2.4: one final TRACE summary per inbound message.
    if (conversationTrace) {
      try {
        if (requestCache) {
          conversationTrace.setCacheStats(
            requestCache.totalHits(),
            requestCache.totalMisses(),
          );
        }
        if (perf && conversationTrace.metaTimeMs === 0) {
          conversationTrace.setMetaTime(perf.getMetaSendTotalMs());
        }
        conversationTrace.printSummary();
      } catch {
        // Observability only — never fail the webhook because the TRACE printer threw.
      }
      setWhatsAppConversationTrace(null);
    }
    if (perf) setWhatsAppPipelineProfiler(null);
    if (requestCache) setWhatsAppRequestCache(null);
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

router.get("/instagram", async (req: Request, res: Response) => {
  try {
    const platform = getWebhookPlatform();
    const result = await platform.instagramHandler.verifyGetByVerifyToken(req.query);
    res.status(result.status).send(result.body);
  } catch (error) {
    logger.error({ err: error }, "Instagram production webhook verification failed");
    res.status(403).send("Forbidden");
  }
});

router.get("/instagram/:companyChannelId", async (req: Request, res: Response) => {
  try {
    const platform = getWebhookPlatform();
    const result = await platform.instagramHandler.verifyGet({
      companyChannelId: routeParam(req.params.companyChannelId),
      ...req.query,
    });
    res.status(result.status).send(result.body);
  } catch (error) {
    logger.error({ err: error }, "Instagram webhook verification failed");
    res.status(403).send("Forbidden");
  }
});

router.post("/instagram", async (req: Request, res: Response) => {
  logDiag("post.route.matched", { route: "POST /instagram" });
  await processInstagramWebhookPost(req, res);
});

router.post("/instagram/:companyChannelId", async (req: Request, res: Response) => {
  const companyChannelId = routeParam(req.params.companyChannelId);
  logDiag("post.route.matched", { route: "POST /instagram/:companyChannelId", companyChannelId });
  await processInstagramWebhookPost(req, res, companyChannelId);
});

router.get("/messenger", async (req: Request, res: Response) => {
  try {
    const platform = getWebhookPlatform();
    const result = await platform.messengerHandler.verifyGetByVerifyToken(req.query);
    res.status(result.status).send(result.body);
  } catch (error) {
    logger.error({ err: error }, "Messenger production webhook verification failed");
    res.status(403).send("Forbidden");
  }
});

router.get("/messenger/:companyChannelId", async (req: Request, res: Response) => {
  try {
    const platform = getWebhookPlatform();
    const result = await platform.messengerHandler.verifyGet({
      companyChannelId: routeParam(req.params.companyChannelId),
      ...req.query,
    });
    res.status(result.status).send(result.body);
  } catch (error) {
    logger.error({ err: error }, "Messenger webhook verification failed");
    res.status(403).send("Forbidden");
  }
});

router.post("/messenger", async (req: Request, res: Response) => {
  logDiag("post.route.matched", { route: "POST /messenger" });
  await processMessengerWebhookPost(req, res);
});

router.post("/messenger/:companyChannelId", async (req: Request, res: Response) => {
  const companyChannelId = routeParam(req.params.companyChannelId);
  logDiag("post.route.matched", { route: "POST /messenger/:companyChannelId", companyChannelId });
  await processMessengerWebhookPost(req, res, companyChannelId);
});

router.post("/email", async (req: Request, res: Response) => {
  logDiag("post.route.matched", { route: "POST /email" });
  await processEmailWebhookPost(req, res);
});

router.post("/email/:companyChannelId", async (req: Request, res: Response) => {
  const companyChannelId = routeParam(req.params.companyChannelId);
  logDiag("post.route.matched", { route: "POST /email/:companyChannelId", companyChannelId });
  await processEmailWebhookPost(req, res, companyChannelId);
});

export default router;
