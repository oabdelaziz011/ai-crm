import { Router, type IRouter } from "express";
import { createClient } from "@supabase/supabase-js";
import i18next from "i18next";
import en from "@login-app/locales/en/common.json" with { type: "json" };
import { SmtpEmailTransport } from "@login-app/lib/notifications/providers/email/adapter/smtp-email-transport";
import { EmailRenderer } from "@login-app/lib/notifications/providers/email/renderer/email-renderer";
import { createEmailProvider } from "@login-app/lib/notifications/providers/email/services/email-provider";
import { providerOpsRateLimiter } from "../middleware/rate-limit.js";
import { requireCompanyScope, requireSupabaseAuth } from "../middleware/supabase-auth.js";

const router: IRouter = Router();

void i18next.init({
  lng: "en",
  resources: { en: { common: en } },
});

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

function createProvider(client: ReturnType<typeof createClient>) {
  const t = i18next.getFixedT("en", "common");
  const renderer = EmailRenderer.fromI18n(t);
  return createEmailProvider(client, new SmtpEmailTransport(), renderer);
}

router.post("/email/health", async (req, res, next) => {
  try {
    const companyId = String(req.body?.companyId ?? "");
    const client = getServiceClient();
    const provider = createProvider(client);
    const result = await provider.healthCheck(companyId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/email/test-connection", async (req, res, next) => {
  try {
    const companyId = String(req.body?.companyId ?? "");
    const recipientEmail = String(req.body?.recipientEmail ?? "");
    if (!recipientEmail) {
      res.status(400).json({ error: "recipientEmail required" });
      return;
    }
    const client = getServiceClient();
    const provider = createProvider(client);
    const result = await provider.testConnection(companyId, recipientEmail);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/email/process-queue", async (req, res, next) => {
  try {
    const companyId = String(req.body?.companyId ?? "");
    const client = getServiceClient();
    const provider = createProvider(client);
    const result = await provider.processPending(companyId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
