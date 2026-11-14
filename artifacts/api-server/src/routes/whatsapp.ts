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
  fingerprintWhatsAppAccessToken,
} from "@workspace/channel-platform";
import { providerOpsRateLimiter } from "../middleware/rate-limit.js";
import { requireCompanyScope, requireSupabaseAuth } from "../middleware/supabase-auth.js";
import { confineToPathPrefixes } from "../middleware/confine-router-paths.js";
import { HttpError } from "../middleware/error-handler.js";
import { assertRouteCommercialFeature } from "../lib/route-commercial-auth.js";
import { requireRequestCompanyPermission } from "../lib/request-company-permission.js";
import {
  WhatsAppConnectionLifecycleError,
  disconnectCompanyWhatsAppConnection,
  transferCompanyWhatsAppConnection,
} from "../services/whatsapp-connection-lifecycle.js";

/** Matches public.whatsapp_settings_can_manage (settings.edit). */
const WHATSAPP_SETTINGS_MANAGE_PERMISSION = "settings.edit";

const router: IRouter = Router();

function mapLifecycleError(error: unknown): never {
  if (error instanceof WhatsAppConnectionLifecycleError) {
    throw new HttpError(error.statusCode, error.message, error.code);
  }
  throw error;
}

void i18next.init({
  lng: "en",
  resources: { en: { common: en } },
});

router.use(confineToPathPrefixes("/whatsapp"));
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
    const credentialsLoader = createSupabaseWhatsAppCredentialsLoader(client);
    const credentials = companyId
      ? await credentialsLoader.loadByCompanyId(companyId)
      : null;
    const tokenFp = credentials
      ? fingerprintWhatsAppAccessToken(credentials.accessToken)
      : null;
    if (credentials && tokenFp) {
      console.info("[whatsapp.health]", {
        at: new Date().toISOString(),
        companyId,
        phoneNumberId: credentials.phoneNumberId || null,
        businessAccountId: credentials.businessAccountId || null,
        tokenSource: "company_whatsapp_settings.get_company_whatsapp_settings_decrypted",
        tokenFrom: "database",
        ...tokenFp,
      });
    }
    const provider = createProvider(client);
    const result = await provider.healthCheck(companyId);
    console.info("[whatsapp.health.result]", {
      at: new Date().toISOString(),
      companyId,
      ok: result.ok,
      tokenFingerprint: tokenFp?.sha256_12 ?? null,
      tokenLength: tokenFp?.length ?? null,
    });
    res.json({
      ...result,
      diagnostics: credentials && tokenFp
        ? {
            tokenSource: "company_whatsapp_settings.get_company_whatsapp_settings_decrypted",
            tokenFrom: "database",
            tokenFingerprint: tokenFp,
            phoneNumberId: credentials.phoneNumberId || null,
            checkedAt: new Date().toISOString(),
          }
        : undefined,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/whatsapp/test-message", async (req, res, next) => {
  try {
    const { assertLocalExternalOutboundAllowed } = await import("../lib/local-outbound-guard.js");
    assertLocalExternalOutboundAllowed("whatsapp/test-message");
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
    const { assertLocalExternalOutboundAllowed } = await import("../lib/local-outbound-guard.js");
    assertLocalExternalOutboundAllowed("whatsapp/process-queue");
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

    const tokenFp = fingerprintWhatsAppAccessToken(credentials.accessToken);
    console.info("[whatsapp.test-connection]", {
      at: new Date().toISOString(),
      companyId,
      phoneNumberId: credentials.phoneNumberId || null,
      businessAccountId: credentials.businessAccountId || null,
      tokenSource: "company_whatsapp_settings.get_company_whatsapp_settings_decrypted",
      tokenFrom: "database",
      ...tokenFp,
    });

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

    console.info("[whatsapp.test-connection.result]", {
      at: new Date().toISOString(),
      companyId,
      phoneNumberId: credentials.phoneNumberId || null,
      ok: report.ok,
      tokenStatus: report.tokenStatus,
      metaErrorCode: report.metaErrorCode ?? null,
      metaErrorSubcode: report.metaErrorSubcode ?? null,
      tokenFingerprint: tokenFp.sha256_12,
      tokenLength: tokenFp.length,
    });

    await persistConnectionTestResult({
      companyId,
      lifecycle,
      report,
    });

    res.json({
      ...report,
      diagnostics: {
        tokenSource: "company_whatsapp_settings.get_company_whatsapp_settings_decrypted",
        tokenFrom: "database",
        tokenFingerprint: tokenFp,
        phoneNumberId: credentials.phoneNumberId || null,
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Soft-disconnect WhatsApp for a company inside ValueOR only.
 * Never calls Meta Graph DELETE / deregister / unsubscribe.
 */
router.post("/whatsapp/disconnect", async (req, res, next) => {
  try {
    const companyId = String(req.body?.companyId ?? "").trim();
    if (!companyId) {
      throw new HttpError(400, "companyId required", "bad_request");
    }
    await assertRouteCommercialFeature(companyId, "whatsapp_channel");
    // Service-role RPC bypasses SQL JWT checks — enforce manage permission here.
    await requireRequestCompanyPermission(req, companyId, WHATSAPP_SETTINGS_MANAGE_PERMISSION);

    const client = getServiceClient();
    const result = await disconnectCompanyWhatsAppConnection(
      {
        companyId,
        confirmPhoneNumberId:
          req.body?.confirmPhoneNumberId == null
            ? null
            : String(req.body.confirmPhoneNumberId),
        confirmText: String(req.body?.confirmText ?? ""),
        actorUserId: req.supabaseUser?.id ?? null,
      },
      client,
    );
    console.info("[whatsapp.lifecycle.disconnect]", {
      companyId: result.companyId ?? companyId,
      phoneNumberId: result.phoneNumberId,
      eventId: result.eventId,
      actorUserId: req.supabaseUser?.id ?? null,
      metaGraph: "none",
    });
    res.json(result);
  } catch (error) {
    try {
      mapLifecycleError(error);
    } catch (mapped) {
      next(mapped);
    }
  }
});

/**
 * Transfer WhatsApp binding between companies inside ValueOR.
 * Moves encrypted credentials server-side; never returns tokens to the client.
 */
router.post("/whatsapp/transfer", async (req, res, next) => {
  try {
    const fromCompanyId = String(req.body?.companyId ?? req.body?.fromCompanyId ?? "").trim();
    const toCompanyId = String(req.body?.toCompanyId ?? "").trim();
    if (!fromCompanyId || !toCompanyId) {
      throw new HttpError(400, "companyId (source) and toCompanyId required", "bad_request");
    }
    // Transfer is Super Admin only at the API boundary (service_role RPC bypasses JWT checks).
    if (!req.supabaseIsSuperAdmin) {
      throw new HttpError(403, "Only a super admin can transfer WhatsApp between companies.", "forbidden");
    }
    await assertRouteCommercialFeature(fromCompanyId, "whatsapp_channel");
    await assertRouteCommercialFeature(toCompanyId, "whatsapp_channel");

    const client = getServiceClient();
    const result = await transferCompanyWhatsAppConnection(
      {
        fromCompanyId,
        toCompanyId,
        confirmPhoneNumberId: String(req.body?.confirmPhoneNumberId ?? ""),
        confirmText: String(req.body?.confirmText ?? ""),
        actorUserId: req.supabaseUser?.id ?? null,
      },
      client,
    );
    console.info("[whatsapp.lifecycle.transfer]", {
      fromCompanyId: result.fromCompanyId,
      toCompanyId: result.toCompanyId,
      phoneNumberId: result.phoneNumberId,
      eventId: result.eventId,
      actorUserId: req.supabaseUser?.id ?? null,
      metaGraph: "none",
    });
    res.json(result);
  } catch (error) {
    try {
      mapLifecycleError(error);
    } catch (mapped) {
      next(mapped);
    }
  }
});

router.post("/whatsapp/lifecycle-events", async (req, res, next) => {
  try {
    const companyId = String(req.body?.companyId ?? "").trim();
    if (!companyId) {
      throw new HttpError(400, "companyId required", "bad_request");
    }
    await requireRequestCompanyPermission(req, companyId, WHATSAPP_SETTINGS_MANAGE_PERMISSION);
    const limit = Math.min(100, Math.max(1, Number(req.body?.limit ?? 20) || 20));
    const client = getServiceClient();
    const { data, error } = await client.rpc("list_whatsapp_connection_lifecycle_events", {
      p_company_id: companyId,
      p_limit: limit,
    });
    if (error) {
      throw new HttpError(500, error.message, "rpc_failed");
    }
    res.json({
      events: Array.isArray(data) ? data : [],
    });
  } catch (error) {
    next(error);
  }
});

export default router;
