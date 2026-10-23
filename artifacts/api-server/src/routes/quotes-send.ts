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
import { QuoteSendApprovalService } from "../services/quote-send/quote-send-approval-service.js";
import { createQuoteSendApprovalSupabasePorts } from "../services/quote-send/quote-send-approval-supabase-ports.js";
import {
  getProcessFakeQuoteSendDispatchController,
  isLocalFakeQuoteSendProviderEnabled,
  withLocalFakeQuoteSendPorts,
  type FakeQuoteSendDispatchMode,
} from "../services/quote-send/fake-quote-send-dispatch.js";

const router: IRouter = Router();

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

/**
 * Authz for quote-send inbox + delivery. Does not construct QuoteSendService
 * (list/reject avoid channel-port setup and dispatch-context scaffolding).
 */
async function authorizeQuotesSendActor(req: Request) {
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

  return {
    companyId,
    actorUserId: baseContext.userId as string,
    userClient,
    platform,
    baseContext,
  };
}

async function buildQuoteSendService(req: Request) {
  const { companyId, actorUserId, userClient, platform, baseContext } =
    await authorizeQuotesSendActor(req);

  const basePorts = createQuoteSendSupabasePorts({
    serviceClient: platform.client,
    userClient,
    companyId,
    actorUserId: baseContext.userId,
    isSuperAdmin: baseContext.isSuperAdmin,
    hasPermission: baseContext.hasPermission,
    dispatchContext: createQuoteSendDispatchContext(baseContext),
  });
  // Local-only: wrap ports so QuoteSendService.send still owns the flow, but
  // dispatch never hits SMTP/Meta (VALUEOR_QUOTE_SEND_FAKE_PROVIDER=1).
  const ports = isLocalFakeQuoteSendProviderEnabled()
    ? withLocalFakeQuoteSendPorts(basePorts, getProcessFakeQuoteSendDispatchController())
    : basePorts;
  const { syncCrmAfterConfirmedQuoteSend } = await import(
    "../services/quote-send/quote-send-crm-sync.js"
  );
  return {
    companyId,
    actorUserId,
    service: new QuoteSendService(ports, () => new Date(), {
      afterConfirmedSend: async ({ companyId: co, quoteId, actorUserId: actor }) => {
        await syncCrmAfterConfirmedQuoteSend(platform.client, {
          companyId: co,
          quoteId,
          actorUserId: actor,
        });
      },
    }),
  };
}

/**
 * Local-only Fake Provider introspection.
 * Auth + quotes.send required; intentionally NOT under providerOpsRateLimiter so
 * local verify scripts (many stats polls) do not 429 and abort mid-run.
 * Still 404 when Fake Provider is disabled (production-safe).
 */
router.get("/send-fake-stats", requireSupabaseAuth, async (req, res, next) => {
  try {
    if (!isLocalFakeQuoteSendProviderEnabled()) {
      throw new HttpError(404, "Not found.", "not_found");
    }
    // companyId optional in body for GET; fall back to JWT company.
    if (!req.body?.companyId && req.supabaseCompanyId) {
      req.body = { ...(req.body ?? {}), companyId: req.supabaseCompanyId };
    }
    await authorizeQuotesSendActor(req);
    res.json({
      enabled: true,
      liveCustomerSend: false,
      ...getProcessFakeQuoteSendDispatchController().stats(),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/send-fake-control", requireSupabaseAuth, async (req, res, next) => {
  try {
    if (!isLocalFakeQuoteSendProviderEnabled()) {
      throw new HttpError(404, "Not found.", "not_found");
    }
    if (!req.body?.companyId && req.supabaseCompanyId) {
      req.body = { ...(req.body ?? {}), companyId: req.supabaseCompanyId };
    }
    await authorizeQuotesSendActor(req);
    const controller = getProcessFakeQuoteSendDispatchController();
    if (req.body?.reset === true) controller.reset();
    const modeRaw = typeof req.body?.mode === "string" ? req.body.mode.trim().toLowerCase() : "";
    if (modeRaw === "success" || modeRaw === "fail" || modeRaw === "timeout") {
      const delayMs =
        typeof req.body?.delayMs === "number" && Number.isFinite(req.body.delayMs)
          ? req.body.delayMs
          : undefined;
      controller.setMode(modeRaw as FakeQuoteSendDispatchMode, {
        delayMs,
        failMessage:
          typeof req.body?.failMessage === "string" ? req.body.failMessage : undefined,
      });
    }
    res.json({
      enabled: true,
      liveCustomerSend: false,
      ...controller.stats(),
    });
  } catch (error) {
    next(error);
  }
});

router.use(providerOpsRateLimiter);
router.use(requireSupabaseAuth);
router.use(requireCompanyScope("companyId"));

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

/**
 * AI send-request inbox + human approve→QuoteSendService / reject.
 * Same auth gate as /send (quotes.send). Does not invent a second delivery path.
 * POST (not GET) so companyId stays in the body under requireCompanyScope.
 */
/** Stub send service for list/reject — those paths must never dispatch. */
const listRejectSendStub = {
  send: async () => {
    throw new QuoteSendError(500, "send_not_allowed_on_path", "List/reject must not send.");
  },
} as unknown as QuoteSendService;

router.post("/send-requests", async (req, res, next) => {
  try {
    // List: permission check only — skip QuoteSendService / channel port construction.
    const { companyId, platform } = await authorizeQuotesSendActor(req);
    const approval = new QuoteSendApprovalService(
      createQuoteSendApprovalSupabasePorts(platform.client),
      listRejectSendStub,
    );
    res.json({ items: await approval.listPending(companyId) });
  } catch (error) {
    if (error instanceof QuoteSendError) return respondQuoteSendError(res, error);
    next(error);
  }
});

router.post("/send-requests/approve", async (req, res, next) => {
  try {
    const quoteId = readQuoteId(req);
    const { companyId, actorUserId, service } = await buildQuoteSendService(req);
    assertLocalExternalOutboundAllowed("quotes/send-requests/approve");
    const platform = getWebhookPlatform();
    const approval = new QuoteSendApprovalService(
      createQuoteSendApprovalSupabasePorts(platform.client),
      service,
    );
    const result = await approval.approveAndSend({
      companyId,
      quoteId,
      actorUserId,
      channel: req.body?.channel,
      idempotencyKey: req.body?.idempotencyKey,
      language: req.body?.language,
    });
    res.json(result);
  } catch (error) {
    if (error instanceof QuoteSendError) return respondQuoteSendError(res, error);
    next(error);
  }
});

router.post("/send-requests/reject", async (req, res, next) => {
  try {
    const quoteId = readQuoteId(req);
    // Reject: permission + metadata write only — no channel ports / dispatch.
    const { companyId, actorUserId, platform } = await authorizeQuotesSendActor(req);
    const approval = new QuoteSendApprovalService(
      createQuoteSendApprovalSupabasePorts(platform.client),
      listRejectSendStub,
    );
    res.json(await approval.reject({ companyId, quoteId, actorUserId }));
  } catch (error) {
    if (error instanceof QuoteSendError) return respondQuoteSendError(res, error);
    next(error);
  }
});

export default router;
