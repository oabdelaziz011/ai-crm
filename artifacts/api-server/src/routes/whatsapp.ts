import { Router, type IRouter } from "express";
import { createClient } from "@supabase/supabase-js";
import i18next from "i18next";
import en from "@login-app/locales/en/common.json" with { type: "json" };
import { MetaWhatsAppTransport } from "@login-app/lib/notifications/providers/whatsapp/adapter/meta-whatsapp-transport";
import { WhatsAppRenderer } from "@login-app/lib/notifications/providers/whatsapp/renderer/whatsapp-renderer";
import { createWhatsAppProvider } from "@login-app/lib/notifications/providers/whatsapp/services/whatsapp-provider";
import { createWhatsAppMessagesCommercialPort } from "../platform/whatsapp-messages-commercial-adapter.js";
import {
  parseWhatsAppChannelReferences,
  performWhatsAppOutboundHealthCheck,
  performWhatsAppConnectionTest,
  persistConnectionTestResult,
  createSupabaseWhatsAppCredentialsLoader,
  createSupabaseWhatsAppCredentialLifecycle,
  resolveWhatsAppRuntimeConfiguration,
} from "@workspace/channel-platform";
import { providerOpsRateLimiter } from "../middleware/rate-limit.js";
import { requireCompanyScope, requireSupabaseAuth } from "../middleware/supabase-auth.js";
import { HttpError } from "../middleware/error-handler.js";
import { assertRouteCommercialFeature } from "../lib/route-commercial-auth.js";

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
  const renderer = WhatsAppRenderer.fromI18n(t);
  return createWhatsAppProvider(client, new MetaWhatsAppTransport(), renderer, {
    whatsappMessagesCommercial: createWhatsAppMessagesCommercialPort(client),
  });
}

router.post("/whatsapp/health", async (req, res, next) => {
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

router.post("/whatsapp/test-message", async (req, res, next) => {
  try {
    const companyId = String(req.body?.companyId ?? "");
    const recipientPhone = String(req.body?.recipientPhone ?? "");
    if (!recipientPhone) {
      res.status(400).json({ error: "recipientPhone required" });
      return;
    }
    await assertRouteCommercialFeature(companyId, "whatsapp_channel");
    const client = getServiceClient();
    const provider = createProvider(client);
    const result = await provider.sendTestMessage(companyId, recipientPhone);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/whatsapp/process-queue", async (req, res, next) => {
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

router.post("/whatsapp/channel-outbound-health", async (req, res, next) => {
  try {
    const companyId = String(req.body?.companyId ?? "");
    const companyChannelId = String(req.body?.companyChannelId ?? "");
    if (!companyChannelId) {
      res.status(400).json({ error: "companyChannelId required" });
      return;
    }

    const client = getServiceClient();
    const credentialsLoader = createSupabaseWhatsAppCredentialsLoader(client);

    const { data: channel, error: channelError } = await client
      .from("company_channels")
      .select("id, company_id, configuration")
      .eq("id", companyChannelId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (channelError) throw channelError;
    if (!channel) {
      res.status(404).json({ error: "channel_not_found" });
      return;
    }

    const channelReferences = parseWhatsAppChannelReferences(channel.configuration ?? {});
    const runtimeConfig = await resolveWhatsAppRuntimeConfiguration(
      companyId,
      channelReferences,
      credentialsLoader,
    );

    const report = await performWhatsAppOutboundHealthCheck({
      companyId,
      runtimeConfig,
    });

    res.json(report);
  } catch (error) {
    next(error);
  }
});

router.post("/whatsapp/test-connection", async (req, res, next) => {
  try {
    const companyId = String(req.body?.companyId ?? "");
    if (!companyId) {
      res.status(400).json({ error: "companyId required" });
      return;
    }

    const client = getServiceClient();
    const credentialsLoader = createSupabaseWhatsAppCredentialsLoader(client);
    const lifecycle = createSupabaseWhatsAppCredentialLifecycle(client);
    const credentials = await credentialsLoader.loadByCompanyId(companyId);

    if (!credentials) {
      res.status(400).json({
        ok: false,
        error: "WhatsApp credentials are not configured.",
        tokenStatus: "missing",
      });
      return;
    }

    const report = await performWhatsAppConnectionTest({
      runtimeConfig: {
        phoneNumberId: credentials.phoneNumberId,
        accessToken: credentials.accessToken,
        verifyToken: credentials.verifyToken,
        appSecret: credentials.appSecret,
        apiVersion: credentials.apiVersion,
        businessAccountId: credentials.businessAccountId,
      },
      appSecret: credentials.appSecret,
    });

    await persistConnectionTestResult({
      companyId,
      lifecycle,
      report,
    });

    res.json(report);
  } catch (error) {
    next(error);
  }
});

export default router;
