/**
 * POST /quotes/send-options — which platform channels can send this quote (and why not).
 * POST /quotes/send         — send the quote via Email Workspace or WhatsApp Cloud.
 *
 * Authorization: authenticated user, company scope, quotes.send (has_company_permission),
 * channel commercial entitlement. Quote reads/writes run under the caller's RLS; channel
 * plumbing reuses the existing ChannelDispatcher (no new provider).
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { providerOpsRateLimiter } from "../middleware/rate-limit.js";
import { requireCompanyScope, requireSupabaseAuth } from "../middleware/supabase-auth.js";
import { HttpError } from "../middleware/error-handler.js";
import {
  CompanyPermissionDeniedError,
  requireCompanyPermission,
} from "../lib/has-company-permission.js";
import { assertLocalExternalOutboundAllowed } from "../lib/local-outbound-guard.js";
import { getWebhookPlatform } from "../platform/create-webhook-platform.js";
import { resolveAgentDispatchContext } from "../platform/resolve-agent-dispatch-context.js";
import { QuoteSendError, QuoteSendService } from "../services/quote-send/quote-send-service.js";
import { createQuoteSendSupabasePorts } from "../services/quote-send/quote-send-supabase-ports.js";
import {
  QUOTE_SEND_PERMISSION,
  createQuoteSendDispatchContext,
} from "../services/quote-send/quote-send-dispatch-context.js";

const router: IRouter = Router();

router.use(providerOpsRateLimiter);
router.use(requireSupabaseAuth);
router.use(requireCompanyScope("companyId"));

function supabaseUrl(): string {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  if (!url) throw new HttpError(503, "Supabase credentials missing", "auth_unavailable");
  return url;
}

function getUserScopedClient(req: Request) {
  const anon =
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!anon || !token) throw new HttpError(401, "Authentication required.", "unauthorized");
  return createClient(supabaseUrl(), anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function resolveEffectiveCompanyId(req: Request): string {
  const companyId = String(req.body?.companyId ?? "");
  const effective = req.supabaseIsSuperAdmin && companyId ? companyId : (req.supabaseCompanyId ?? companyId);
  if (!effective) throw new HttpError(400, "companyId required", "validation_error");
  return effective;
}

function readQuoteId(req: Request): string {
  const quoteId = typeof req.body?.quoteId === "string" ? req.body.quoteId.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(quoteId)) throw new HttpError(400, "quoteId is required.", "validation_error");
  return quoteId;
}

async function buildQuoteSendService(req: Request) {
  const companyId = resolveEffectiveCompanyId(req);
  const userClient = getUserScopedClient(req);
  if (!req.supabaseIsSuperAdmin) {
    try {
      await requireCompanyPermission(userClient, companyId, QUOTE_SEND_PERMISSION);
    } catch (error) {
      if (error instanceof CompanyPermissionDeniedError) {
        throw new HttpError(403, "You do not have permission to send quotes.", "forbidden");
      }
      throw error;
    }
  }

  const platform = getWebhookPlatform();
  const baseContext = await resolveAgentDispatchContext(platform.client, req, companyId);
  if (!baseContext.isSuperAdmin && !baseContext.hasPermission(QUOTE_SEND_PERMISSION)) {
    throw new HttpError(403, "You do not have permission to send quotes.", "forbidden");
  }

  const ports = createQuoteSendSupabasePorts({
    serviceClient: platform.client,
    userClient,
    companyId,
    actorUserId: baseContext.userId,
    isSuperAdmin: baseContext.isSuperAdmin,
    hasPermission: baseContext.hasPermission,
    dispatchContext: createQuoteSendDispatchContext(baseContext),
  });
  return { companyId, actorUserId: baseContext.userId, service: new QuoteSendService(ports) };
}

function respondQuoteSendError(res: Response, error: QuoteSendError): void {
  res.status(error.status).json({ error: error.code, message: error.message, details: error.details });
}

router.post("/send-options", async (req, res, next) => {
  try {
    const quoteId = readQuoteId(req);
    const { companyId, service } = await buildQuoteSendService(req);
    res.json(await service.getSendOptions({ companyId, quoteId }));
  } catch (error) {
    if (error instanceof QuoteSendError) return respondQuoteSendError(res, error);
    next(error);
  }
});

router.post("/send", async (req, res, next) => {
  try {
    const quoteId = readQuoteId(req);
    const { companyId, actorUserId, service } = await buildQuoteSendService(req);
    assertLocalExternalOutboundAllowed("quotes/send");
    const result = await service.send({
      companyId,
      quoteId,
      channel: req.body?.channel,
      idempotencyKey: req.body?.idempotencyKey,
      language: req.body?.language,
      actorUserId,
    });
    res.json(result);
  } catch (error) {
    if (error instanceof QuoteSendError) return respondQuoteSendError(res, error);
    next(error);
  }
});

export default router;
