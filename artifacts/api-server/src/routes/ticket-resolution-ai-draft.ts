/**
 * POST /tickets/ai/resolution-message — Ticket Close & Notify AI draft only.
 * Never sends outbound; never closes tickets; never selects channel/recipient.
 * Reuses the same commercial/RBAC gates as Email AI Draft.
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
import type { EmailAiDraftLanguage, EmailAiDraftTone } from "../services/email-ai-draft.js";
import {
  TICKET_RESOLUTION_AI_FEATURE_CODE,
  TICKET_RESOLUTION_AI_PERMISSION,
  generateTicketResolutionMessageServer,
  type TicketResolutionAiMode,
} from "../services/ticket-resolution-ai-draft.js";

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

router.post("/tickets/ai/resolution-message", async (req, res, next) => {
  try {
    const companyId = resolveEffectiveCompanyId(req);
    const ticketId = readString(req.body?.ticketId);
    if (!ticketId) {
      throw new HttpError(400, "ticketId is required", "validation_error");
    }

    await assertRouteCommercialFeature(companyId, TICKET_RESOLUTION_AI_FEATURE_CODE);

    try {
      const userClient = getUserScopedClient(req);
      // Same AI gate as Email Copilot. Ticket close/send remain enforced by the Close & Notify path.
      await requireCompanyPermission(userClient, companyId, TICKET_RESOLUTION_AI_PERMISSION);
    } catch (error) {
      if (error instanceof CompanyPermissionDeniedError) {
        throw new HttpError(403, "Permission denied.", "forbidden");
      }
      throw error;
    }

    const modeRaw = readString(req.body?.mode, "generate");
    const mode: TicketResolutionAiMode =
      modeRaw === "rewrite" ||
      modeRaw === "shorter" ||
      modeRaw === "more_formal" ||
      modeRaw === "friendlier"
        ? modeRaw
        : "generate";

    const toneRaw = readString(req.body?.tone, "professional");
    const tone: EmailAiDraftTone =
      toneRaw === "formal" || toneRaw === "friendly" || toneRaw === "concise"
        ? toneRaw
        : "professional";

    const langRaw = readString(req.body?.outputLanguage, "en");
    const outputLanguage: EmailAiDraftLanguage =
      langRaw === "ar" ||
      langRaw === "en" ||
      langRaw === "fr" ||
      langRaw === "de" ||
      langRaw === "es" ||
      langRaw === "auto"
        ? langRaw
        : "en";

    const conversationId = readString(req.body?.conversationId) || null;
    const client = getServiceClient();

    const result = await generateTicketResolutionMessageServer({
      client,
      companyId,
      userId: req.supabaseUser?.id ?? null,
      ticketId,
      conversationId,
      outputLanguage,
      tone,
      mode,
      currentDraft: readString(req.body?.currentDraft) || null,
      fallbackTemplate: readString(req.body?.fallbackTemplate) || null,
      instruction: readString(req.body?.instruction) || null,
    });

    res.status(200).json({
      body: result.body,
      language: result.language,
      tone: result.tone,
      model: result.model,
      providerKey: result.providerKey,
      usage: result.usage,
      latencyMs: result.latencyMs,
      usedFallback: false,
      neverSend: true,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
