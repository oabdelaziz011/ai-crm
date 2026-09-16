/**
 * Microsoft 365 OAuth connect + mailbox provider metadata routes.
 * Tokens are exchanged and stored server-side only (never returned to the browser).
 */
import { Router, type IRouter } from "express";
import { randomBytes } from "node:crypto";
import {
  buildMicrosoftAuthorizeUrl,
  decodeMicrosoftOAuthState,
  encodeMicrosoftOAuthState,
  exchangeMicrosoftAuthorizationCode,
  readMicrosoftEmailOAuthEnv,
  EMAIL_PROVIDER_PRESETS,
  inferMailboxProvider,
  resolveEmailProviderCapabilities,
  createEmailProviderAdapter,
  loadCompanyEmailCredentialsDecrypted,
  resolveEmailRuntimeConfiguration,
  type EmailMailboxProvider,
} from "@workspace/channel-platform";
import { requireCompanyScope, requireSupabaseAuth } from "../middleware/supabase-auth.js";
import { HttpError } from "../middleware/error-handler.js";
import { assertRouteCommercialFeature } from "../lib/route-commercial-auth.js";
import { getWebhookPlatform } from "../platform/create-webhook-platform.js";
import { probeImapConnection } from "../platform/email-imap-runtime.js";
import { requireRequestCompanyPermission } from "../lib/request-company-permission.js";
import { EMAIL_CONNECTION_PERMISSION } from "../lib/email-tab-permissions.js";

const router: IRouter = Router();

const SAFE_PROVIDER_ERROR_MESSAGES: Record<string, { en: string; ar: string }> = {
  "email_provider.connect_failed": {
    en: "Could not connect to the mail server.",
    ar: "تعذر الاتصال بخادم البريد.",
  },
  "email_provider.auth_invalid": {
    en: "Sign-in details are incorrect.",
    ar: "بيانات الدخول غير صحيحة.",
  },
  "email_provider.oauth_expired": {
    en: "Microsoft connection expired. Please reconnect.",
    ar: "انتهت صلاحية اتصال Microsoft، يرجى إعادة الربط.",
  },
  "email_provider.server_rejected": {
    en: "The mail server rejected the connection.",
    ar: "الخادم رفض الاتصال.",
  },
  "email_provider.send_failed": {
    en: "Could not send the message.",
    ar: "تعذر إرسال الرسالة.",
  },
  "email_provider.not_configured": {
    en: "Email is not configured for this company.",
    ar: "البريد الإلكتروني غير مُعد لهذه الشركة.",
  },
  "email_provider.oauth_not_configured": {
    en: "Microsoft OAuth is not configured on the server.",
    ar: "إعدادات Microsoft OAuth غير متوفرة على الخادم.",
  },
  "email_provider.sync_failed": {
    en: "Unable to synchronize email.",
    ar: "تعذر مزامنة البريد.",
  },
};

router.post("/email/providers", requireSupabaseAuth, requireCompanyScope("companyId"), async (req, res) => {
  const companyId = String(req.body?.companyId ?? "");
  if (!companyId) {
    res.status(400).json({ error: "companyId is required" });
    return;
  }
  try {
    await assertRouteCommercialFeature(companyId, "email_channel");
    await requireRequestCompanyPermission(req, companyId, EMAIL_CONNECTION_PERMISSION);
  } catch (error) {
    if (error instanceof HttpError && error.code === "forbidden") {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    res.status(403).json({ error: "email_channel_not_entitled" });
    return;
  }

  const oauthConfigured = Boolean(readMicrosoftEmailOAuthEnv());
  const providers = (Object.keys(EMAIL_PROVIDER_PRESETS) as EmailMailboxProvider[]).map((key) => {
    const preset = EMAIL_PROVIDER_PRESETS[key];
    return {
      mailboxProvider: key,
      authMode: preset.authMode,
      capabilities: resolveEmailProviderCapabilities(key),
      defaults: {
        smtpHost: preset.smtpHost,
        smtpPort: preset.smtpPort,
        smtpEncryption: preset.smtpEncryption,
        imapHost: preset.imapHost,
        imapPort: preset.imapPort,
        imapEncryption: preset.imapEncryption,
        inboundProvider: preset.inboundProviderDefault,
        outboundProvider: preset.outboundProviderDefault,
      },
      oauthAvailable: key === "microsoft_365" ? oauthConfigured : false,
    };
  });

  res.status(200).json({ providers, microsoftOAuthConfigured: oauthConfigured });
});

router.post(
  "/email/providers/apply-preset",
  requireSupabaseAuth,
  requireCompanyScope("companyId"),
  async (req, res, next) => {
    try {
      const companyId = String(req.body?.companyId ?? "");
      const mailboxProvider = String(req.body?.mailboxProvider ?? "") as EmailMailboxProvider;
      if (!companyId || !["gmail", "microsoft_365", "imap_smtp"].includes(mailboxProvider)) {
        res.status(400).json({ error: "companyId and mailboxProvider are required" });
        return;
      }
      await assertRouteCommercialFeature(companyId, "email_channel");
      await requireRequestCompanyPermission(req, companyId, EMAIL_CONNECTION_PERMISSION);

      const preset = EMAIL_PROVIDER_PRESETS[mailboxProvider];
      const platform = getWebhookPlatform();

      // Non-secret preset only — does not write passwords. Client still saves credentials via existing upsert.
      const { data: existing } = await platform.client
        .from("company_email_settings")
        .select("smtp_host, imap_host, inbound_provider, outbound_provider, oauth_provider, mailbox_provider")
        .eq("company_id", companyId)
        .maybeSingle();

      const inferred = inferMailboxProvider({
        mailboxProvider,
        oauthProvider: existing?.oauth_provider,
        inboundProvider: existing?.inbound_provider,
        outboundProvider: existing?.outbound_provider,
        smtpHost: existing?.smtp_host,
        imapHost: existing?.imap_host,
      });

      const patch: Record<string, unknown> = {
        mailbox_provider: inferred,
        inbound_provider: preset.inboundProviderDefault,
        outbound_provider: preset.outboundProviderDefault,
        updated_at: new Date().toISOString(),
      };
      if (mailboxProvider === "gmail") {
        patch.smtp_host = preset.smtpHost;
        patch.smtp_port = preset.smtpPort;
        patch.smtp_encryption = preset.smtpEncryption;
        patch.imap_host = preset.imapHost;
        patch.imap_port = preset.imapPort;
        patch.imap_encryption = preset.imapEncryption;
        // Gmail preset includes IMAP — ready for inbound poll once credentials are saved.
        patch.conversation_enabled = true;
        patch.enabled = true;
      }
      if (mailboxProvider === "imap_smtp") {
        patch.conversation_enabled = true;
        patch.enabled = true;
      }
      if (mailboxProvider === "microsoft_365") {
        patch.connection_status = "connecting";
        patch.smtp_host = "";
        patch.imap_host = "";
      }

      const { error } = await platform.client
        .from("company_email_settings")
        .upsert({ company_id: companyId, ...patch }, { onConflict: "company_id" });
      if (error) {
        res.status(500).json({ error: "email_provider.connect_failed" });
        return;
      }

      await platform.client.rpc("sync_email_channel_references", { p_company_id: companyId });

      res.status(200).json({
        ok: true,
        mailboxProvider: inferred,
        capabilities: resolveEmailProviderCapabilities(inferred),
        microsoftOAuthConfigured: Boolean(readMicrosoftEmailOAuthEnv()),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/email/microsoft/oauth/start",
  requireSupabaseAuth,
  requireCompanyScope("companyId"),
  async (req, res, next) => {
    try {
      const companyId = String(req.body?.companyId ?? "");
      const userId = String(req.supabaseUser?.id ?? "");
      if (!companyId || !userId) {
        res.status(400).json({ error: "companyId is required" });
        return;
      }
      await assertRouteCommercialFeature(companyId, "email_channel");
      await requireRequestCompanyPermission(req, companyId, EMAIL_CONNECTION_PERMISSION);

      const env = readMicrosoftEmailOAuthEnv();
      if (!env) {
        res.status(503).json({
          error: "email_provider.oauth_not_configured",
          message: SAFE_PROVIDER_ERROR_MESSAGES["email_provider.oauth_not_configured"],
        });
        return;
      }

      const nonce = randomBytes(16).toString("hex");
      const state = encodeMicrosoftOAuthState({ companyId, userId, nonce });
      const authorizeUrl = buildMicrosoftAuthorizeUrl(env, { state });

      const platform = getWebhookPlatform();
      await platform.client.from("company_email_settings").upsert(
        {
          company_id: companyId,
          mailbox_provider: "microsoft_365",
          inbound_provider: "microsoft_graph",
          outbound_provider: "microsoft_graph",
          connection_status: "connecting",
          connection_last_error: "",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id" },
      );

      // Never return client secret. State is opaque CSRF binding.
      res.status(200).json({ authorizeUrl, state });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Browser redirect callback from Microsoft.
 * Exchanges code server-side and stores encrypted tokens — response never includes tokens.
 */
router.get("/email/microsoft/oauth/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const stateRaw = typeof req.query.state === "string" ? req.query.state : "";
  const errorParam = typeof req.query.error === "string" ? req.query.error : "";

  const frontendBase =
    process.env.LOGIN_APP_URL?.replace(/\/$/, "") ||
    process.env.VITE_APP_ORIGIN?.replace(/\/$/, "") ||
    "http://localhost:5173";
  const redirectSettings = `${frontendBase}/dashboard/settings/email`;

  if (errorParam || !code || !stateRaw) {
    res.redirect(
      `${redirectSettings}?microsoft_oauth=error&reason=${encodeURIComponent(errorParam || "missing_code")}`,
    );
    return;
  }

  const state = decodeMicrosoftOAuthState(stateRaw);
  if (!state || Date.now() - state.issuedAt > 15 * 60 * 1000) {
    res.redirect(`${redirectSettings}?microsoft_oauth=error&reason=invalid_state`);
    return;
  }

  const env = readMicrosoftEmailOAuthEnv();
  if (!env) {
    res.redirect(`${redirectSettings}?microsoft_oauth=error&reason=oauth_not_configured`);
    return;
  }

  try {
    await assertRouteCommercialFeature(state.companyId, "email_channel");
    const tokens = await exchangeMicrosoftAuthorizationCode(env, { code });
    const platform = getWebhookPlatform();

    // Resolve mailbox profile (email) without exposing token to client.
    let fromEmail = "";
    let fromName = "";
    try {
      const me = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName", {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      if (me.ok) {
        const json = (await me.json()) as Record<string, unknown>;
        fromEmail =
          (typeof json.mail === "string" && json.mail) ||
          (typeof json.userPrincipalName === "string" ? json.userPrincipalName : "") ||
          "";
        fromName = typeof json.displayName === "string" ? json.displayName : "";
      }
    } catch {
      // Profile lookup is best-effort; tokens still stored.
    }

    const expiresAt =
      tokens.expiresIn != null ? new Date(Date.now() + tokens.expiresIn * 1000).toISOString() : null;

    const { error } = await platform.client.rpc("store_company_email_oauth_tokens", {
      p_company_id: state.companyId,
      p_oauth_provider: "microsoft",
      p_access_token: tokens.accessToken,
      p_refresh_token: tokens.refreshToken,
      p_expires_at: expiresAt,
      p_mailbox_provider: "microsoft_365",
      p_from_email: fromEmail || null,
      p_from_name: fromName || null,
      p_connection_status: "connected",
    });

    if (error) {
      res.redirect(`${redirectSettings}?microsoft_oauth=error&reason=store_failed`);
      return;
    }

    res.redirect(`${redirectSettings}?microsoft_oauth=connected`);
  } catch {
    res.redirect(`${redirectSettings}?microsoft_oauth=error&reason=exchange_failed`);
  }
});

router.get("/email/provider-errors", (_req, res) => {
  res.status(200).json({ messages: SAFE_PROVIDER_ERROR_MESSAGES });
});

/**
 * Staged provider connection test: incoming | outgoing | full | oauth.
 * Never returns credentials or raw provider stack traces.
 */
router.post(
  "/email/providers/test-connection",
  requireSupabaseAuth,
  requireCompanyScope("companyId"),
  async (req, res, next) => {
    try {
      const companyId = String(req.body?.companyId ?? "");
      const stageRaw = String(req.body?.stage ?? "full");
      const stage =
        stageRaw === "incoming" ||
        stageRaw === "outgoing" ||
        stageRaw === "oauth" ||
        stageRaw === "full"
          ? stageRaw
          : "full";
      if (!companyId) {
        res.status(400).json({ error: "companyId is required" });
        return;
      }
      await assertRouteCommercialFeature(companyId, "email_channel");
      await requireRequestCompanyPermission(req, companyId, EMAIL_CONNECTION_PERMISSION);

      const platform = getWebhookPlatform();

      const credentials = await loadCompanyEmailCredentialsDecrypted(platform.client, companyId);
      if (!credentials) {
        res.status(404).json({
          ok: false,
          error: "email_provider.not_configured",
          message: SAFE_PROVIDER_ERROR_MESSAGES["email_provider.not_configured"],
        });
        return;
      }

      const runtime = await resolveEmailRuntimeConfiguration(
        companyId,
        { fromEmail: credentials.fromEmail, credentialsSource: "company_email_settings" },
        { loadByCompanyId: async () => credentials },
      );

      const mailboxProvider = inferMailboxProvider({
        mailboxProvider: runtime.mailboxProvider,
        oauthProvider: runtime.oauthProvider,
        inboundProvider: runtime.inboundProvider,
        outboundProvider: runtime.outboundProvider,
        smtpHost: runtime.smtpHost,
        imapHost: runtime.imapHost,
      });

      const adapter = createEmailProviderAdapter(mailboxProvider, {
        imapProbe: async (config) => probeImapConnection(config),
      });

      const result = await adapter.testConnection(runtime, stage);
      const errorKey = result.errorCode ?? "";
      const message =
        errorKey && SAFE_PROVIDER_ERROR_MESSAGES[errorKey]
          ? SAFE_PROVIDER_ERROR_MESSAGES[errorKey]
          : undefined;

      // Successful inbound/full probe means the mailbox can receive — enable conversation
      // ingest so the background poller is not silently gated off.
      if (
        result.ok &&
        (stage === "incoming" || stage === "full" || stage === "oauth") &&
        !credentials.conversationEnabled
      ) {
        const inboundReady =
          runtime.inboundProvider === "microsoft_graph" || Boolean(runtime.imapHost?.trim());
        if (inboundReady) {
          await platform.client
            .from("company_email_settings")
            .update({
              conversation_enabled: true,
              updated_at: new Date().toISOString(),
            })
            .eq("company_id", companyId);
        }
      }

      res.status(200).json({
        ok: result.ok,
        stage: result.stage,
        latencyMs: result.latencyMs,
        mailboxProvider,
        error: result.ok ? undefined : result.errorCode ?? "email_provider.connect_failed",
        message,
        conversationEnabled:
          result.ok &&
          (stage === "incoming" || stage === "full" || stage === "oauth") &&
          (runtime.inboundProvider === "microsoft_graph" || Boolean(runtime.imapHost?.trim()))
            ? true
            : credentials.conversationEnabled,
        // Never include credentials / tokens.
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
export { SAFE_PROVIDER_ERROR_MESSAGES };
