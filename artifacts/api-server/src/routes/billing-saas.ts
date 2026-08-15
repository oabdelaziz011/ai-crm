import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { requireSupabaseAuth } from "../middleware/supabase-auth.js";
import { HttpError } from "../middleware/error-handler.js";
import { createSaasCheckoutSession } from "../billing/saas/checkout-service.js";

const router: IRouter = Router();

router.use(requireSupabaseAuth);

/**
 * POST /api/billing/saas/checkout
 * Authenticated company creates a price-locked SaaS checkout session.
 * Body must NOT supply amount/currency/company_id for authorization.
 */
router.post("/checkout", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.supabaseIsSuperAdmin && !req.supabaseCompanyId) {
      throw new HttpError(
        400,
        "Super-admin checkout requires an active company context on the profile.",
        "company_context_required",
      );
    }

    const companyId = req.supabaseCompanyId;
    if (!companyId) {
      throw new HttpError(403, "No company context for authenticated user.", "forbidden");
    }

    // Reject attempts to target another company via body
    const bodyCompany = req.body?.companyId ?? req.body?.company_id;
    if (bodyCompany && String(bodyCompany) !== companyId) {
      throw new HttpError(403, "Cannot create checkout for another company.", "forbidden");
    }

    // Explicitly ignore client amount/currency if sent
    const returnUrl = String(req.body?.returnUrl ?? req.body?.return_url ?? "").trim();
    const cancelUrl = (req.body?.cancelUrl ?? req.body?.cancel_url ?? null) as string | null;
    const idempotencyKey = (req.body?.idempotencyKey ?? req.body?.idempotency_key ?? null) as
      | string
      | null;

    if (!returnUrl) {
      throw new HttpError(400, "returnUrl is required", "validation_error");
    }

    const result = await createSaasCheckoutSession({
      companyId,
      returnUrl,
      cancelUrl,
      idempotencyKey,
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
