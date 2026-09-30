import { Router, type IRouter } from "express";
import { createClient } from "@supabase/supabase-js";
import { providerOpsRateLimiter } from "../middleware/rate-limit.js";
import { requireCompanyScope, requireSupabaseAuth } from "../middleware/supabase-auth.js";
import { HttpError } from "../middleware/error-handler.js";
import { assertRouteCommercialFeature } from "../lib/route-commercial-auth.js";
import { isWhatsAppEmbeddedSignupEnabled } from "../services/whatsapp-embedded-signup-flags.js";
import {
  WhatsAppEmbeddedSignupError,
  completeWhatsAppEmbeddedSignup,
  createWhatsAppEmbeddedSignupSession,
} from "../services/whatsapp-embedded-signup.js";

const router: IRouter = Router();

router.use(providerOpsRateLimiter);
router.use(requireSupabaseAuth);
router.use(requireCompanyScope("companyId"));

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new HttpError(503, "Supabase service credentials missing", "supabase_unavailable");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function mapEsError(error: unknown): never {
  if (error instanceof WhatsAppEmbeddedSignupError) {
    throw new HttpError(error.statusCode, error.message, error.code);
  }
  throw error;
}

function assertFeatureEnabled(): void {
  if (!isWhatsAppEmbeddedSignupEnabled()) {
    throw new HttpError(403, "WhatsApp Embedded Signup is disabled.", "ES_DISABLED");
  }
}

router.post("/whatsapp/embedded-signup/session", async (req, res, next) => {
  try {
    assertFeatureEnabled();
    const companyId = String(req.body?.companyId ?? "").trim();
    if (!companyId) {
      throw new HttpError(400, "companyId required", "bad_request");
    }
    await assertRouteCommercialFeature(companyId, "whatsapp_channel");

    const session = await createWhatsAppEmbeddedSignupSession({
      companyId,
      userId: req.supabaseUser?.id ?? null,
    });
    res.json(session);
  } catch (error) {
    try {
      mapEsError(error);
    } catch (mapped) {
      next(mapped);
    }
  }
});

router.post("/whatsapp/embedded-signup/complete", async (req, res, next) => {
  try {
    assertFeatureEnabled();
    const companyId = String(req.body?.companyId ?? "").trim();
    if (!companyId) {
      throw new HttpError(400, "companyId required", "bad_request");
    }
    await assertRouteCommercialFeature(companyId, "whatsapp_channel");

    const client = getServiceClient();
    const result = await completeWhatsAppEmbeddedSignup(
      {
        companyId,
        userId: req.supabaseUser?.id ?? null,
        code: String(req.body?.code ?? ""),
        state: String(req.body?.state ?? ""),
        phoneNumberId: String(req.body?.phoneNumberId ?? ""),
        businessAccountId: String(req.body?.businessAccountId ?? req.body?.wabaId ?? ""),
        businessPortfolioId:
          req.body?.businessPortfolioId == null
            ? null
            : String(req.body.businessPortfolioId),
        replaceExisting: req.body?.replaceExisting === true,
        coexistenceEligible:
          typeof req.body?.coexistenceEligible === "boolean"
            ? req.body.coexistenceEligible
            : null,
      },
      { client },
    );

    res.json(result);
  } catch (error) {
    try {
      mapEsError(error);
    } catch (mapped) {
      next(mapped);
    }
  }
});

router.post("/whatsapp/embedded-signup/status", async (req, res, next) => {
  try {
    assertFeatureEnabled();
    const companyId = String(req.body?.companyId ?? "").trim();
    if (!companyId) {
      throw new HttpError(400, "companyId required", "bad_request");
    }
    await assertRouteCommercialFeature(companyId, "whatsapp_channel");

    const client = getServiceClient();
    const { data, error } = await client
      .from("company_whatsapp_embedded_signup")
      .select(
        "company_id, onboarding_method, status, meta_app_id, business_portfolio_id, phone_number_id, business_account_id, coexistence_eligible, coexistence_enabled, last_error, started_at, completed_at, updated_at",
      )
      .eq("company_id", companyId)
      .maybeSingle();

    if (error) {
      throw new HttpError(500, error.message, "ES_STATUS_READ_FAILED");
    }

    res.json({
      enabled: true,
      row: data ?? null,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
