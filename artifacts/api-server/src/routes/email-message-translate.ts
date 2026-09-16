/**
 * POST /email/messages/:messageId/translate — read-only email translation.
 * Architecturally isolated from outbound send / SMTP / Graph / dispatch / draft.
 */
import { Router, type IRouter, type Request } from "express";
import { createClient } from "@supabase/supabase-js";
import { providerOpsRateLimiter } from "../middleware/rate-limit.js";
import { requireCompanyScope, requireSupabaseAuth } from "../middleware/supabase-auth.js";
import { HttpError } from "../middleware/error-handler.js";
import { assertRouteCommercialFeature } from "../lib/route-commercial-auth.js";
import {
  CompanyPermissionDeniedError,
  requireCompanyPermission,
} from "../lib/has-company-permission.js";
import { logger } from "../lib/logger.js";
import {
  EMAIL_MESSAGE_TRANSLATE_FEATURE_CODE,
  EMAIL_MESSAGE_TRANSLATE_PERMISSION,
  translateEmailMessageServer,
} from "../services/email-message-translate.js";

const router: IRouter = Router();

router.use(providerOpsRateLimiter);
router.use(requireSupabaseAuth);
router.use(requireCompanyScope("companyId"));

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new HttpError(503, "Supabase service credentials missing", "auth_unavailable");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getUserScopedClient(req: Request) {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anon =
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!url || !anon || !token) {
    throw new HttpError(401, "Authentication required.", "unauthorized");
  }
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function resolveEffectiveCompanyId(req: Request): string {
  const companyId = String(req.body?.companyId ?? "");
  const effectiveCompanyId =
    req.supabaseIsSuperAdmin && companyId
      ? companyId
      : (req.supabaseCompanyId ?? companyId);
  if (!effectiveCompanyId) {
    throw new HttpError(400, "companyId required", "validation_error");
  }
  return effectiveCompanyId;
}

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

router.post("/email/messages/:messageId/translate", async (req, res, next) => {
  try {
    const companyId = resolveEffectiveCompanyId(req);
    const messageId = readString(req.params.messageId);
    if (!messageId) {
      throw new HttpError(400, "messageId is required", "validation_error");
    }
    const targetLanguage = readString(req.body?.targetLanguage);
    if (!targetLanguage) {
      throw new HttpError(400, "targetLanguage is required", "validation_error");
    }

    await assertRouteCommercialFeature(companyId, EMAIL_MESSAGE_TRANSLATE_FEATURE_CODE);

    try {
      const userClient = getUserScopedClient(req);
      await requireCompanyPermission(userClient, companyId, EMAIL_MESSAGE_TRANSLATE_PERMISSION);
    } catch (error) {
      if (error instanceof CompanyPermissionDeniedError) {
        throw new HttpError(403, "Permission denied.", "forbidden");
      }
      throw error;
    }

    const client = getServiceClient();
    const result = await translateEmailMessageServer({
      client,
      companyId,
      userId: req.supabaseUser?.id ?? null,
      messageId,
      targetLanguage,
    });

    // Never include secrets or provider credentials.
    res.status(200).json({
      sourceLanguage: result.sourceLanguage,
      sourceLanguageLabel: result.sourceLanguageLabel,
      targetLanguage: result.targetLanguage,
      translatedText: result.translatedText,
      truncated: result.truncated,
      neverSend: true,
      model: result.model,
      providerKey: result.providerKey,
      usage: result.usage,
      latencyMs: result.latencyMs,
    });
  } catch (error) {
    const status =
      error instanceof HttpError
        ? error.statusCode
        : error && typeof error === "object" && "statusCode" in error
          ? Number((error as { statusCode?: number }).statusCode) || 500
          : 500;
    const errorCode =
      error instanceof HttpError
        ? error.code ?? "translation_request_failed"
        : error instanceof Error
          ? error.name
          : "translation_request_failed";
    logger.warn(
      {
        event: "translation_request_failed",
        companyId: req.supabaseCompanyId ?? req.body?.companyId ?? null,
        messageId: req.params?.messageId ?? null,
        targetLanguage:
          typeof req.body?.targetLanguage === "string" ? req.body.targetLanguage : null,
        status,
        errorCode,
        provider: "platform_ai_gateway",
        requestId: req.requestId,
      },
      "translation_request_failed",
    );
    next(error);
  }
});

export default router;
