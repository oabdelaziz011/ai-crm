import { Router, type IRouter } from "express";
import { createClient } from "@supabase/supabase-js";
import i18next from "i18next";
import en from "@login-app/locales/en/common.json" with { type: "json" };
import { MetaWhatsAppTransport } from "@login-app/lib/notifications/providers/whatsapp/adapter/meta-whatsapp-transport";
import { WhatsAppRenderer } from "@login-app/lib/notifications/providers/whatsapp/renderer/whatsapp-renderer";
import { createWhatsAppProvider } from "@login-app/lib/notifications/providers/whatsapp/services/whatsapp-provider";

const router: IRouter = Router();

void i18next.init({
  lng: "en",
  resources: { en: { common: en } },
});

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
  const renderer = WhatsAppRenderer.fromI18n(t);
  return createWhatsAppProvider(client, new MetaWhatsAppTransport(), renderer);
}

router.post("/whatsapp/health", async (req, res) => {
  try {
    const companyId = String(req.body?.companyId ?? "");
    if (!companyId) {
      res.status(400).json({ error: "companyId required" });
      return;
    }
    const client = getServiceClient();
    const provider = createProvider(client);
    const result = await provider.healthCheck(companyId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

router.post("/whatsapp/test-message", async (req, res) => {
  try {
    const companyId = String(req.body?.companyId ?? "");
    const recipientPhone = String(req.body?.recipientPhone ?? "");
    if (!companyId || !recipientPhone) {
      res.status(400).json({ error: "companyId and recipientPhone required" });
      return;
    }
    const client = getServiceClient();
    const provider = createProvider(client);
    const result = await provider.sendTestMessage(companyId, recipientPhone);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

router.post("/whatsapp/process-queue", async (req, res) => {
  try {
    const companyId = String(req.body?.companyId ?? "");
    if (!companyId) {
      res.status(400).json({ error: "companyId required" });
      return;
    }
    const client = getServiceClient();
    const provider = createProvider(client);
    const result = await provider.processPending(companyId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
