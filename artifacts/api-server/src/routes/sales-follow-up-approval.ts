/**
 * Authenticated sales follow-up draft review APIs.
 * Human approval is enforced server-side; delivery reuses omnichannel outbound.
 */
import { Router, type IRouter, type Request } from "express";
import { createClient } from "@supabase/supabase-js";
import {
  approveAndSendSalesFollowUpDraft,
  createSupabaseSalesFollowUpAttemptStore,
  listSalesFollowUpReviewItems,
  rejectSalesFollowUpDraft,
  rescheduleSalesFollowUpDraft,
  updateSalesFollowUpDraftMessage,
  type SalesFollowUpReviewStatus,
} from "@workspace/automation-platform";
import { providerOpsRateLimiter } from "../middleware/rate-limit.js";
import { requireCompanyScope, requireSupabaseAuth } from "../middleware/supabase-auth.js";
import { HttpError } from "../middleware/error-handler.js";
import { assertRouteCommercialFeature } from "../lib/route-commercial-auth.js";
import {
  CompanyPermissionDeniedError,
  requireCompanyPermission,
} from "../lib/has-company-permission.js";
import { loadSalesFollowUpEligibility } from "../services/sales-follow-up-eligibility.js";
import { createOmnichannelSalesFollowUpDelivery } from "../services/sales-follow-up-delivery.js";
import { isSalesFollowUpProviderSendAllowed } from "../services/sales-follow-up-worker.js";
import type { ServiceContext } from "@workspace/channel-platform";

const router: IRouter = Router();

router.use(providerOpsRateLimiter);
router.use(requireSupabaseAuth);
// Body-scoped company check applies to mutating routes only.
// GET lists pass companyId as a query param (validated in-handler).

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
  const companyId = String(req.body?.companyId ?? req.query?.companyId ?? "");
  if (!companyId) {
    throw new HttpError(400, "companyId required", "validation_error");
  }
  if (req.supabaseIsSuperAdmin) return companyId;
  if (!req.supabaseCompanyId || req.supabaseCompanyId !== companyId) {
    throw new HttpError(403, "Access denied for this company.", "forbidden");
  }
  return companyId;
}

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

async function assertFollowUpPermission(req: Request, companyId: string, permission: string) {
  await assertRouteCommercialFeature(companyId, "leads");
  try {
    const userClient = getUserScopedClient(req);
    await requireCompanyPermission(userClient, companyId, permission);
  } catch (error) {
    if (error instanceof CompanyPermissionDeniedError) {
      throw new HttpError(403, "Permission denied.", "forbidden");
    }
    throw error;
  }
}

function buildServiceContext(companyId: string, actorUserId: string): ServiceContext {
  return {
    userId: actorUserId,
    companyId,
    isSuperAdmin: false,
    hasPermission: () => true,
  };
}

router.get("/sales-follow-up/drafts", async (req, res, next) => {
  try {
    const companyId = resolveEffectiveCompanyId(req);
    await assertFollowUpPermission(req, companyId, "leads.view");
    const statusRaw = readString(req.query?.status, "pending_review");
    const status = (
      ["pending_review", "sent", "failed", "cancelled", "all"].includes(statusRaw)
        ? statusRaw
        : "pending_review"
    ) as SalesFollowUpReviewStatus | "all";
    const limit = Number(req.query?.limit ?? 50);
    const items = await listSalesFollowUpReviewItems(getServiceClient(), {
      companyId,
      status,
      limit: Number.isFinite(limit) ? limit : 50,
    });
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.patch(
  "/sales-follow-up/drafts/:jobId",
  requireCompanyScope("companyId"),
  async (req, res, next) => {
  try {
    const companyId = resolveEffectiveCompanyId(req);
    await assertFollowUpPermission(req, companyId, "leads.edit");
    const jobId = readString(req.params.jobId);
    const messageText = readString(req.body?.messageText);
    const actorUserId = String(req.supabaseUserId ?? "");
    if (!jobId || !actorUserId) {
      throw new HttpError(400, "jobId and authenticated user required", "validation_error");
    }
    const result = await updateSalesFollowUpDraftMessage(getServiceClient(), {
      companyId,
      jobId,
      messageText,
      actorUserId,
    });
    if (!result.updated) {
      throw new HttpError(409, result.reason ?? "not_a_draft", "conflict");
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
},
);

router.post(
  "/sales-follow-up/drafts/:jobId/reject",
  requireCompanyScope("companyId"),
  async (req, res, next) => {
  try {
    const companyId = resolveEffectiveCompanyId(req);
    await assertFollowUpPermission(req, companyId, "leads.edit");
    const jobId = readString(req.params.jobId);
    const actorUserId = String(req.supabaseUserId ?? "");
    if (!jobId || !actorUserId) {
      throw new HttpError(400, "jobId and authenticated user required", "validation_error");
    }
    const result = await rejectSalesFollowUpDraft(getServiceClient(), {
      companyId,
      jobId,
      actorUserId,
      reason: readString(req.body?.reason, "rejected_by_staff"),
    });
    if (!result.rejected) {
      throw new HttpError(409, result.reason ?? "not_a_draft", "conflict");
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
},
);

router.post(
  "/sales-follow-up/drafts/:jobId/reschedule",
  requireCompanyScope("companyId"),
  async (req, res, next) => {
  try {
    const companyId = resolveEffectiveCompanyId(req);
    await assertFollowUpPermission(req, companyId, "leads.edit");
    const jobId = readString(req.params.jobId);
    const actorUserId = String(req.supabaseUserId ?? "");
    const dueAtRaw = readString(req.body?.dueAt);
    if (!jobId || !actorUserId || !dueAtRaw) {
      throw new HttpError(400, "jobId, dueAt, and authenticated user required", "validation_error");
    }
    const result = await rescheduleSalesFollowUpDraft(getServiceClient(), {
      companyId,
      jobId,
      actorUserId,
      dueAt: new Date(dueAtRaw),
    });
    if (!result.rescheduled) {
      throw new HttpError(409, result.reason ?? "not_a_draft", "conflict");
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
},
);

router.post(
  "/sales-follow-up/drafts/:jobId/approve",
  requireCompanyScope("companyId"),
  async (req, res, next) => {
  try {
    const companyId = resolveEffectiveCompanyId(req);
    await assertFollowUpPermission(req, companyId, "leads.edit");
    const jobId = readString(req.params.jobId);
    const actorUserId = String(req.supabaseUserId ?? "");
    if (!jobId || !actorUserId) {
      throw new HttpError(400, "jobId and authenticated user required", "validation_error");
    }

    const client = getServiceClient();
    const serviceContext = buildServiceContext(companyId, actorUserId);
    const result = await approveAndSendSalesFollowUpDraft({
      client,
      companyId,
      jobId,
      actorUserId,
      messageText: typeof req.body?.messageText === "string" ? req.body.messageText : null,
      allowProviderSend: isSalesFollowUpProviderSendAllowed(),
      delivery: createOmnichannelSalesFollowUpDelivery(serviceContext),
      attempts: createSupabaseSalesFollowUpAttemptStore(client),
      loadEligibility: (job, settings) => loadSalesFollowUpEligibility(client, job, settings),
    });

    if (!result.ok) {
      const status =
        result.reason === "provider_send_disabled"
          ? 503
          : result.cancelled
            ? 409
            : result.reason === "not_a_draft" || result.reason === "approval_in_progress"
              ? 409
              : 400;
      throw new HttpError(status, result.reason, result.reason);
    }

    res.json({
      ok: true,
      delivered: true,
      providerMessageId: result.providerMessageId,
    });
  } catch (error) {
    next(error);
  }
},
);

export default router;
