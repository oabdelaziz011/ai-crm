import type { Request, Response } from "express";
import {
  assertChannelSettingsEnabled,
  assertWebhookCompanyChannel,
  collectInstagramWebhookSignatureSecrets,
  createSupabaseInstagramCredentialsLoader,
  createWebhookProcessingTrace,
  extractInstagramBusinessAccountId,
  resolveInstagramWebhookCompanyChannelId,
  summarizeInstagramWebhookPayload,
  describeInstagramWebhookShape,
  verifyMetaWebhookSignatureWithSecrets,
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

function describeIncomingBody(req: Request): {
  rawBodyIsBuffer: boolean;
  rawBodyByteLength: number | null;
} {
  if (req.body instanceof Buffer) {
    return { rawBodyIsBuffer: true, rawBodyByteLength: req.body.length };
  }
  return { rawBodyIsBuffer: false, rawBodyByteLength: null };
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

  const { rawBodyIsBuffer, rawBodyByteLength } = describeIncomingBody(req);
  const rawBody = readRawBody(req);
  let payload: Record<string, unknown>;

  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    res.status(400).json({ error: "invalid_json" });
    return;
  }

  trace.step("webhook.payload_parsed", {
    ...summarizeInstagramWebhookPayload(payload),
    ...describeInstagramWebhookShape(payload),
  });

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
      return matches.map((match) => ({ id: match.id, companyId: match.companyId }));
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
  const signatureHeader = req.header("x-hub-signature-256");
  const trimmedSignatureHeader = signatureHeader?.trim() ?? "";
  const hasSignatureHeader = Boolean(signatureHeader);
  const signatureHeaderPresent = hasSignatureHeader;
  const signatureHeaderStartsWithSha256 = trimmedSignatureHeader.startsWith("sha256=");
  const signatureHeaderLength = trimmedSignatureHeader.length;
  const secretSet = collectInstagramWebhookSignatureSecrets({
    companyAppSecret: appSecretForSignature,
  });
  const hasAppSecret = secretSet.candidates.length > 0;
  const signatureDiag = {
    instagramWebhookDiag: true,
    requestId,
    companyId: channel.companyId,
    companyChannelId,
    instagramBusinessAccountId,
    companyCredentialSource: "company_instagram_settings",
    expectedMetaAppId: secretSet.expectedMetaAppId,
    envAppIdIsDiagnosticOnly: true,
    secretSources: secretSet.candidates.map((candidate) => candidate.source),
    secretCandidateCount: secretSet.candidates.length,
    secretCandidateLengths: secretSet.candidates.map((candidate) => candidate.length),
    requireSecret,
    hasAppSecret,
    companyAppSecretPresent: Boolean(appSecretForSignature),
    usesRawUtf8Body: true,
    hasSignatureHeader,
    signatureHeaderPresent,
    signatureHeaderStartsWithSha256,
    signatureHeaderLength,
    rawBodyIsBuffer,
    rawBodyByteLength,
  };

  logger.info(
    {
      webhookDiag: true,
      diagStage: "post.signature_verification.start",
      ...signatureDiag,
    },
    "[IG-WEBHOOK-DIAG] post.signature_verification.start",
  );

  const signatureResult = await verifyMetaWebhookSignatureWithSecrets({
    signatureHeader,
    rawBody,
    secrets: secretSet.candidates,
    requireSecret,
  });
  const signatureValid = signatureResult.ok;

  logger.info(
    {
      webhookDiag: true,
      diagStage: "post.signature_verification.result",
      ...signatureDiag,
      signatureValid,
      matchedSecretSource: signatureResult.matchedSource,
      sourcesTried: signatureResult.sourcesTried,
      skippedBecauseNoSecret: !hasAppSecret && !requireSecret,
    },
    "[IG-WEBHOOK-DIAG] post.signature_verification.result",
  );

  if (!signatureValid) {
    logger.info(
      {
        webhookDiag: true,
        diagStage: "post.early_return",
        ...signatureDiag,
        signatureValid,
        matchedSecretSource: signatureResult.matchedSource,
        sourcesTried: signatureResult.sourcesTried,
        httpStatus: 401,
        reason: "invalid_signature",
      },
      "[IG-WEBHOOK-DIAG] post.early_return: invalid_signature",
    );
    trace.step("webhook.signature_rejected", {
      requestId,
      companyId: channel.companyId,
      instagramBusinessAccountId,
      requireSecret,
      hasAppSecret,
      hasSignatureHeader,
      signatureHeaderPresent,
      signatureHeaderStartsWithSha256,
      signatureHeaderLength,
      rawBodyIsBuffer,
      rawBodyByteLength,
      signatureValid,
      matchedSecretSource: signatureResult.matchedSource,
      sourcesTried: signatureResult.sourcesTried,
    });
    res.status(401).json({ error: "invalid_signature" });
    return;
  }

  trace.step("webhook.signature_verified", {
    requestId,
    companyId: channel.companyId,
    instagramBusinessAccountId,
    signatureValid,
    matchedSecretSource: signatureResult.matchedSource,
  });

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
      {
        err: error,
        companyChannelId,
        routingSource: routing.source,
        webhookDiag: true,
        diagStage: "post.processing_failed",
        ...describeInstagramWebhookShape(payload),
      },
      "Instagram webhook processing failed",
    );
    res.status(500).json({ error: "webhook_processing_failed" });
  }
}
