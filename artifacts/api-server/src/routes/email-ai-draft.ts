/**
 * POST /email/ai/draft — Email Copilot draft generate/rewrite.
 * Architecturally isolated from outbound send / SMTP / Graph / dispatch.
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
import {
  EMAIL_AI_DRAFT_FEATURE_CODE,
  EMAIL_AI_DRAFT_PERMISSION,
  generateEmailAiDraftServer,
  type EmailAiDraftLanguage,
  type EmailAiDraftMode,
  type EmailAiDraftTone,
} from "../services/email-ai-draft.js";

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

router.post("/email/ai/draft", async (req, res, next) => {
  try {
    const companyId = resolveEffectiveCompanyId(req);
    const instruction = readString(req.body?.instruction);
    if (!instruction) {
      throw new HttpError(400, "instruction is required", "validation_error");
    }

    await assertRouteCommercialFeature(companyId, EMAIL_AI_DRAFT_FEATURE_CODE);

    try {
      const userClient = getUserScopedClient(req);
      await requireCompanyPermission(userClient, companyId, EMAIL_AI_DRAFT_PERMISSION);
    } catch (error) {
      if (error instanceof CompanyPermissionDeniedError) {
        throw new HttpError(403, "Permission denied.", "forbidden");
      }
      throw error;
    }

    const modeRaw = readString(req.body?.mode, "generate");
    const mode: EmailAiDraftMode = modeRaw === "rewrite" ? "rewrite" : "generate";

    const toneRaw = readString(req.body?.tone, "professional");
    const tone: EmailAiDraftTone =
      toneRaw === "formal" || toneRaw === "friendly" || toneRaw === "concise"
        ? toneRaw
        : "professional";

    const langRaw = readString(req.body?.outputLanguage, "auto");
    const outputLanguage: EmailAiDraftLanguage =
      langRaw === "ar" ||
      langRaw === "en" ||
      langRaw === "fr" ||
      langRaw === "de" ||
      langRaw === "es"
        ? langRaw
        : "auto";

    const conversationId = readString(req.body?.conversationId) || null;
    const client = getServiceClient();

    const result = await generateEmailAiDraftServer({
      client,
      companyId,
      userId: req.supabaseUser?.id ?? null,
      instruction,
      mode,
      outputLanguage,
      tone,
      subject: readString(req.body?.subject) || null,
      body: readString(req.body?.body) || null,
      conversationId,
      updateSubject: Boolean(req.body?.updateSubject),
      // Explicit true only — never infer from missing fields; never accept signature HTML.
      hasExistingSignature: req.body?.hasExistingSignature === true,
    });

    // Never include secrets or provider credentials.
    res.status(200).json({
      subject: result.subject,
      body: result.body,
      language: result.language,
      tone: result.tone,
      model: result.model,
      providerKey: result.providerKey,
      usage: result.usage,
      latencyMs: result.latencyMs,
      neverSend: true,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
