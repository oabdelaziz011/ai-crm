import { Router, type IRouter } from "express";
import { createClient } from "@supabase/supabase-js";
import { providerOpsRateLimiter } from "../middleware/rate-limit.js";
import { requireCompanyScope, requireSupabaseAuth } from "../middleware/supabase-auth.js";
import { assertRouteCommercialFeature } from "../lib/route-commercial-auth.js";
import {
  performSmsConnectionTest,
  type SmsDecryptedSettings,
} from "../services/sms-connection-test.js";

const router: IRouter = Router();

router.use(providerOpsRateLimiter);
router.use(requireSupabaseAuth);
router.use(requireCompanyScope("companyId"));

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service credentials missing");
  }
  return createClient(url, key);
}

async function loadDecryptedSmsSettings(companyId: string): Promise<SmsDecryptedSettings | null> {
  const client = getServiceClient();
  const { data, error } = await client.rpc("get_company_sms_settings_decrypted", {
    p_company_id: companyId,
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  return {
    enabled: Boolean(row.enabled),
    provider: String(row.provider ?? ""),
    accountSid: String(row.account_sid ?? ""),
    fromNumber: String(row.from_number ?? ""),
    authToken: String(row.auth_token ?? ""),
  };
}

router.post("/sms/test-connection", async (req, res, next) => {
  try {
    const companyId = String(req.body?.companyId ?? "");
    if (!companyId) {
      res.status(400).json({ ok: false, error: "companyId required" });
      return;
    }

    await assertRouteCommercialFeature(companyId, "sms_channel");

    const settings = await loadDecryptedSmsSettings(companyId);
    const report = await performSmsConnectionTest(settings);

    // Never echo secrets — report is already sanitized.
    res.status(report.ok ? 200 : 400).json(report);
  } catch (error) {
    next(error);
  }
});

export default router;
