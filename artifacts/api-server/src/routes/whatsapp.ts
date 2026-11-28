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
import {
  requireRequestAnyCompanyPermission,
  requireRequestCompanyPermission,
} from "../lib/request-company-permission.js";
import {
  WhatsAppConnectionLifecycleError,
  disconnectCompanyWhatsAppConnection,
  transferCompanyWhatsAppConnection,
} from "../services/whatsapp-connection-lifecycle.js";
import { readMetaEmbeddedSignupEnvConfig } from "../services/whatsapp-embedded-signup-flags.js";
import {
  WhatsAppBusinessProfileError,
  createWhatsAppBusinessProfileDeps,
  getWhatsAppBusinessProfile,
  getWhatsAppPhoneVerificationStatus,
  syncWhatsAppBusinessProfile,
  updateWhatsAppBusinessProfile,
  updateWhatsAppBusinessProfilePicture,
} from "../services/whatsapp-business-profile.js";

/** Matches public.whatsapp_settings_can_manage (settings.edit). */
const WHATSAPP_SETTINGS_MANAGE_PERMISSION = "settings.edit";

/** Purpose-template sends are used by sales + settings flows. */
const WHATSAPP_PURPOSE_SEND_PERMISSIONS = [
  "orders.edit",
  "orders.assign_delivery",
  "orders.approve_cancellation",
  "settings.edit",
] as const;

function mapBusinessProfileError(error: unknown): never {
  if (error instanceof WhatsAppBusinessProfileError) {
    throw new HttpError(error.statusCode, error.message, error.code);
  }
  throw error;
}

async function assertWhatsAppBusinessProfileAccess(
  req: Parameters<typeof requireRequestCompanyPermission>[0],
  companyId: string,
): Promise<void> {
  await assertRouteCommercialFeature(companyId, "whatsapp_channel");
  await requireRequestCompanyPermission(req, companyId, WHATSAPP_SETTINGS_MANAGE_PERMISSION);
}

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
// GET template routes pass companyId as query; company-scope middleware reads body.
router.use((req, res, next) => {
  if (req.method !== "GET") {
    next();
    return;
  }
  const path = req.path || "";
  if (!path.includes("/whatsapp/templates")) {
    next();
    return;
  }
  const queryCompanyId = String(req.query.companyId ?? "").trim();
  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {};
  const bodyCompanyId = String(body.companyId ?? "").trim();
  if (queryCompanyId && bodyCompanyId && queryCompanyId !== bodyCompanyId) {
    res.status(400).json({ error: "companyId_mismatch" });
    return;
  }
  if (queryCompanyId) {
    req.body = { ...body, companyId: queryCompanyId };
  }
  next();
});
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

router.post("/whatsapp/send-text", async (req, res, next) => {
  try {
    const { assertLocalExternalOutboundAllowed } = await import("../lib/local-outbound-guard.js");
    assertLocalExternalOutboundAllowed("whatsapp/send-text");
    const companyId = String(req.body?.companyId ?? "");
    const recipientPhone = String(req.body?.recipientPhone ?? "");
    const text = String(req.body?.text ?? "");
    const sessionWindowOpen = req.body?.sessionWindowOpen === true;
    if (!recipientPhone) {
      res.status(400).json({ error: "recipientPhone required" });
      return;
    }
    if (!text.trim()) {
      res.status(400).json({ error: "text required" });
      return;
    }
    await assertRouteCommercialFeature(companyId, "whatsapp_channel");
    const client = getServiceClient();
    const provider = createProvider(client);
    const result = await provider.sendFreeformText(companyId, recipientPhone, text, {
      sessionWindowOpen,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/whatsapp/send-purpose", async (req, res, next) => {
  try {
    const { assertLocalExternalOutboundAllowed } = await import("../lib/local-outbound-guard.js");
    assertLocalExternalOutboundAllowed("whatsapp/send-purpose");
    const companyId = String(req.body?.companyId ?? "");
    const recipientPhone = String(req.body?.recipientPhone ?? "");
    const purpose = String(req.body?.purpose ?? "");
    const params =
      req.body?.params && typeof req.body.params === "object" && !Array.isArray(req.body.params)
        ? (req.body.params as Record<string, string>)
        : {};
    if (!recipientPhone) {
      res.status(400).json({ error: "recipientPhone required" });
      return;
    }
    if (!purpose.trim()) {
      res.status(400).json({ error: "purpose required" });
      return;
    }
    const { isWhatsAppMessagePurpose } = await import(
      "@login-app/lib/notifications/providers/whatsapp/templates/whatsapp-purpose-templates.js"
    );
    if (!isWhatsAppMessagePurpose(purpose)) {
      res.status(400).json({ error: "invalid_purpose", purpose });
      return;
    }
    if (purpose === "connection_test") {
      res.status(400).json({
        error: "connection_test_not_allowed",
        message: "connection_test cannot be sent via send-purpose; use the connection test endpoint.",
      });
      return;
    }
    await assertRouteCommercialFeature(companyId, "whatsapp_channel");
    await requireRequestAnyCompanyPermission(req, companyId, WHATSAPP_PURPOSE_SEND_PERMISSIONS);
    const client = getServiceClient();
    const provider = createProvider(client);
    const result = await provider.sendPurposeTemplate(companyId, recipientPhone, purpose, params);
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

router.get("/whatsapp/templates/catalog", async (req, res, next) => {
  try {
    const companyId = String(req.query.companyId ?? req.body?.companyId ?? "").trim();
    if (!companyId) {
      res.status(400).json({ error: "companyId required" });
      return;
    }
    await assertRouteCommercialFeature(companyId, "whatsapp_channel");
    const { getWhatsAppPurposeCatalogForApi } = await import(
      "@login-app/lib/notifications/providers/whatsapp/services/whatsapp-company-templates.js"
    );
    res.json({ companyId, catalog: getWhatsAppPurposeCatalogForApi() });
  } catch (error) {
    next(error);
  }
});

router.get("/whatsapp/templates", async (req, res, next) => {
  try {
    const companyId = String(req.query.companyId ?? req.body?.companyId ?? "").trim();
    if (!companyId) {
      res.status(400).json({ error: "companyId required" });
      return;
    }
    await assertRouteCommercialFeature(companyId, "whatsapp_channel");
    await requireRequestCompanyPermission(req, companyId, WHATSAPP_SETTINGS_MANAGE_PERMISSION);

    const client = getServiceClient();
    const { WhatsAppSettingsRepository } = await import(
      "@login-app/lib/notifications/providers/whatsapp/services/whatsapp-settings-repository.js"
    );
    const { listCompanyWhatsAppTemplates, getWhatsAppPurposeCatalogForApi } = await import(
      "@login-app/lib/notifications/providers/whatsapp/services/whatsapp-company-templates.js"
    );
    const { computeWhatsAppTemplateSetupReadiness } = await import(
      "@login-app/lib/notifications/providers/whatsapp/services/whatsapp-template-readiness.js"
    );
    const { isWhatsAppTemplateSetupError } = await import(
      "@login-app/lib/notifications/providers/whatsapp/services/whatsapp-template-setup-error.js"
    );
    const settingsRepo = new WhatsAppSettingsRepository(client);
    const publicSettings = await settingsRepo.getPublic(companyId);

    let templates: Awaited<ReturnType<typeof listCompanyWhatsAppTemplates>> = [];
    let setupPending = false;
    try {
      templates = await listCompanyWhatsAppTemplates(client, companyId);
    } catch (error) {
      if (isWhatsAppTemplateSetupError(error)) {
        setupPending = true;
      } else {
        throw error;
      }
    }

    const lastSyncedAt = templates.reduce<string | null>((latest, row) => {
      if (!row.lastSyncedAt) return latest;
      if (!latest || row.lastSyncedAt > latest) return row.lastSyncedAt;
      return latest;
    }, null);
    const readiness = computeWhatsAppTemplateSetupReadiness(templates, { setupPending });

    res.json({
      companyId,
      setupPending,
      connection: {
        enabled: publicSettings.enabled,
        phoneNumberId: publicSettings.phoneNumberId,
        businessAccountId: publicSettings.businessAccountId,
        tokenStatus: publicSettings.tokenStatus,
        defaultLanguage: publicSettings.defaultLanguage,
      },
      lastSyncedAt,
      catalog: getWhatsAppPurposeCatalogForApi(),
      templates,
      readiness,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Template admin credentials: WABA + token only.
 * Intentionally does NOT require settings.enabled — outbound sending stays gated
 * in createWhatsAppProvider / send paths.
 */
async function loadTemplateAdminCredentialsForCompany(companyId: string) {
  const client = getServiceClient();
  const {
    loadWhatsAppTemplateAdminCredentials,
    WhatsAppTemplateAdminCredentialsError,
  } = await import("../services/whatsapp-template-admin-credentials.js");
  try {
    return await loadWhatsAppTemplateAdminCredentials(client, companyId);
  } catch (error) {
    if (error instanceof WhatsAppTemplateAdminCredentialsError) {
      throw new HttpError(error.statusCode, error.message, error.code);
    }
    throw error;
  }
}

router.post("/whatsapp/templates/sync", async (req, res, next) => {
  try {
    const companyId = String(req.body?.companyId ?? "").trim();
    if (!companyId) {
      res.status(400).json({ error: "companyId required" });
      return;
    }
    await assertRouteCommercialFeature(companyId, "whatsapp_channel");
    await requireRequestCompanyPermission(req, companyId, WHATSAPP_SETTINGS_MANAGE_PERMISSION);

    const { client, credentials } = await loadTemplateAdminCredentialsForCompany(companyId);
    const { syncCompanyWhatsAppTemplatesFromMeta } = await import(
      "@login-app/lib/notifications/providers/whatsapp/services/whatsapp-company-templates.js"
    );
    const { WhatsAppTemplateMetaClientError } = await import(
      "@login-app/lib/notifications/providers/whatsapp/services/whatsapp-template-meta-client.js"
    );
    const { isWhatsAppTemplateSetupError } = await import(
      "@login-app/lib/notifications/providers/whatsapp/services/whatsapp-template-setup-error.js"
    );

    try {
      // Graph calls are scoped to this company's WABA only.
      const result = await syncCompanyWhatsAppTemplatesFromMeta(client, {
        companyId,
        accessToken: credentials.accessToken,
        businessAccountId: credentials.businessAccountId,
        apiVersion: credentials.apiVersion,
        languageCode: credentials.defaultLanguage,
      });
      res.json(result);
    } catch (error) {
      if (isWhatsAppTemplateSetupError(error)) {
        throw new HttpError(error.statusCode, error.message, error.code);
      }
      if (error instanceof WhatsAppTemplateMetaClientError) {
        throw new HttpError(error.statusCode, error.message, error.code);
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

router.post("/whatsapp/templates/provision", async (req, res, next) => {
  try {
    const companyId = String(req.body?.companyId ?? "").trim();
    if (!companyId) {
      res.status(400).json({ error: "companyId required" });
      return;
    }
    await assertRouteCommercialFeature(companyId, "whatsapp_channel");
    await requireRequestCompanyPermission(req, companyId, WHATSAPP_SETTINGS_MANAGE_PERMISSION);

    const { client, credentials } = await loadTemplateAdminCredentialsForCompany(companyId);
    const { provisionCompanyWhatsAppTemplates } = await import(
      "@login-app/lib/notifications/providers/whatsapp/services/whatsapp-template-provisioning.js"
    );
    const { WhatsAppTemplateMetaClientError } = await import(
      "@login-app/lib/notifications/providers/whatsapp/services/whatsapp-template-meta-client.js"
    );
    const { isWhatsAppTemplateSetupError } = await import(
      "@login-app/lib/notifications/providers/whatsapp/services/whatsapp-template-setup-error.js"
    );
    const { isWhatsAppMessagePurpose } = await import(
      "@login-app/lib/notifications/providers/whatsapp/templates/whatsapp-purpose-templates.js"
    );

    // Optional purposes[] scopes Meta create/reuse. Omit / empty → all transactional.
    // connection_test is never accepted for provisioning.
    let purposes: string[] | undefined;
    const rawPurposes = req.body?.purposes;
    if (rawPurposes !== undefined && rawPurposes !== null) {
      if (!Array.isArray(rawPurposes)) {
        res.status(400).json({ error: "purposes_invalid", message: "purposes must be an array of purpose keys" });
        return;
      }
      purposes = rawPurposes
        .map((p: unknown) => String(p ?? "").trim())
        .filter((p: string) => p && p !== "connection_test" && isWhatsAppMessagePurpose(p));
      if (purposes.length === 0) {
        res.status(400).json({
          error: "purposes_invalid",
          message: "No valid transactional WhatsApp template purposes were provided.",
        });
        return;
      }
    }

    try {
      // Graph calls are scoped to this company's WABA only.
      const result = await provisionCompanyWhatsAppTemplates(client, {
        companyId,
        accessToken: credentials.accessToken,
        businessAccountId: credentials.businessAccountId,
        apiVersion: credentials.apiVersion,
        languageCode: credentials.defaultLanguage,
        purposes: purposes as
          | import("@login-app/lib/notifications/providers/whatsapp/templates/whatsapp-purpose-templates").WhatsAppMessagePurpose[]
          | undefined,
      });
      res.json(result);
    } catch (error) {
      if (isWhatsAppTemplateSetupError(error)) {
        throw new HttpError(error.statusCode, error.message, error.code);
      }
      if (error instanceof WhatsAppTemplateMetaClientError) {
        throw new HttpError(error.statusCode, error.message, error.code);
      }
      throw error;
    }
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

    const metaAppId =
      String(readMetaEmbeddedSignupEnvConfig()?.appId ?? "").trim() ||
      String(process.env.META_EMBEDDED_SIGNUP_APP_ID ?? "").trim() ||
      null;
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
      appId: metaAppId,
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

/**
 * Fetch WhatsApp Business Profile from Meta for the authenticated company tenant.
 * Phone Number ID is resolved from company credentials — never trusted from the client.
 */
router.post("/whatsapp/business-profile/get", async (req, res, next) => {
  try {
    const companyId = String(req.body?.companyId ?? "").trim();
    if (!companyId) throw new HttpError(400, "companyId required", "bad_request");
    await assertWhatsAppBusinessProfileAccess(req, companyId);
    const client = getServiceClient();
    const profile = await getWhatsAppBusinessProfile(
      companyId,
      createWhatsAppBusinessProfileDeps(client),
    );
    res.json({ profile });
  } catch (error) {
    try {
      mapBusinessProfileError(error);
    } catch (mapped) {
      next(mapped);
    }
  }
});

router.post("/whatsapp/business-profile/status", async (req, res, next) => {
  try {
    const companyId = String(req.body?.companyId ?? "").trim();
    if (!companyId) throw new HttpError(400, "companyId required", "bad_request");
    await assertWhatsAppBusinessProfileAccess(req, companyId);
    const client = getServiceClient();
    const status = await getWhatsAppPhoneVerificationStatus(
      companyId,
      createWhatsAppBusinessProfileDeps(client),
    );
    res.json({ status });
  } catch (error) {
    try {
      mapBusinessProfileError(error);
    } catch (mapped) {
      next(mapped);
    }
  }
});

router.post("/whatsapp/business-profile/sync", async (req, res, next) => {
  try {
    const companyId = String(req.body?.companyId ?? "").trim();
    if (!companyId) throw new HttpError(400, "companyId required", "bad_request");
    await assertWhatsAppBusinessProfileAccess(req, companyId);
    const client = getServiceClient();
    const profile = await syncWhatsAppBusinessProfile(
      companyId,
      createWhatsAppBusinessProfileDeps(client),
    );
    res.json({ profile });
  } catch (error) {
    try {
      mapBusinessProfileError(error);
    } catch (mapped) {
      next(mapped);
    }
  }
});

router.post("/whatsapp/business-profile/update", async (req, res, next) => {
  try {
    const companyId = String(req.body?.companyId ?? "").trim();
    if (!companyId) throw new HttpError(400, "companyId required", "bad_request");
    await assertWhatsAppBusinessProfileAccess(req, companyId);
    // Reject client-supplied phoneNumberId for mutations — tenant credentials win.
    if (req.body?.phoneNumberId != null && String(req.body.phoneNumberId).trim()) {
      throw new HttpError(
        400,
        "phoneNumberId cannot be supplied by the client for business profile updates.",
        "BP_PHONE_NUMBER_ID_FORBIDDEN",
      );
    }
    const client = getServiceClient();
    const profile = await updateWhatsAppBusinessProfile(
      companyId,
      {
        about: req.body?.about,
        address: req.body?.address,
        description: req.body?.description,
        email: req.body?.email,
        websites: req.body?.websites,
        vertical: req.body?.vertical,
      },
      createWhatsAppBusinessProfileDeps(client),
    );
    res.json({ profile });
  } catch (error) {
    try {
      mapBusinessProfileError(error);
    } catch (mapped) {
      next(mapped);
    }
  }
});

router.post("/whatsapp/business-profile/picture", async (req, res, next) => {
  try {
    const companyId = String(req.body?.companyId ?? "").trim();
    if (!companyId) throw new HttpError(400, "companyId required", "bad_request");
    await assertWhatsAppBusinessProfileAccess(req, companyId);
    if (req.body?.phoneNumberId != null && String(req.body.phoneNumberId).trim()) {
      throw new HttpError(
        400,
        "phoneNumberId cannot be supplied by the client for business profile picture updates.",
        "BP_PHONE_NUMBER_ID_FORBIDDEN",
      );
    }

    const mimeType = String(req.body?.mimeType ?? "").trim();
    const imageBase64 = String(req.body?.imageBase64 ?? "").trim();
    if (!imageBase64) {
      throw new HttpError(400, "imageBase64 is required", "BP_IMAGE_INVALID");
    }
    // Strip optional data-URL prefix.
    const raw = imageBase64.replace(/^data:[^;]+;base64,/, "");
    let bytes: Buffer;
    try {
      bytes = Buffer.from(raw, "base64");
    } catch {
      throw new HttpError(400, "imageBase64 is invalid", "BP_IMAGE_INVALID");
    }
    if (!bytes.length) {
      throw new HttpError(400, "imageBase64 is empty", "BP_IMAGE_INVALID");
    }

    const client = getServiceClient();
    const profile = await updateWhatsAppBusinessProfilePicture(
      companyId,
      {
        mimeType,
        bytes,
        fileName: req.body?.fileName == null ? undefined : String(req.body.fileName),
      },
      createWhatsAppBusinessProfileDeps(client),
    );
    // Never return the Meta handle to the browser — only refreshed profile fields.
    res.json({
      profile: {
        about: profile.about,
        address: profile.address,
        description: profile.description,
        email: profile.email,
        websites: profile.websites,
        vertical: profile.vertical,
        profilePictureUrl: profile.profilePictureUrl,
        phoneNumberId: profile.phoneNumberId,
        displayPhoneNumber: profile.displayPhoneNumber,
        verifiedName: profile.verifiedName,
        isOfficialBusinessAccount: profile.isOfficialBusinessAccount,
        isPinEnabled: profile.isPinEnabled,
        nameStatus: profile.nameStatus,
        syncedAt: profile.syncedAt,
      },
    });
  } catch (error) {
    try {
      mapBusinessProfileError(error);
    } catch (mapped) {
      next(mapped);
    }
  }
});

export default router;
