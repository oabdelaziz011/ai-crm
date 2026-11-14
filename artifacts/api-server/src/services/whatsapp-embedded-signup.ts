import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildWhatsAppEmbeddedSignupV4LaunchExtras,
  isWhatsAppCoexistenceEnabled,
  isWhatsAppEmbeddedSignupCompanyAllowed,
  isWhatsAppEmbeddedSignupEnabled,
  isWhatsAppEmbeddedSignupRegisterPhoneEnabled,
  META_EMBEDDED_SIGNUP_CLOUD_API_CONFIG_ID_ENV,
  META_EMBEDDED_SIGNUP_COEXISTENCE_CONFIG_ID_ENV,
  readMetaEmbeddedSignupConfigIdForMode,
  readMetaEmbeddedSignupEnvConfig,
  readWhatsAppEmbeddedSignupRegistrationPin,
  WHATSAPP_EMBEDDED_SIGNUP_PROTOCOL_VERSION,
  WHATSAPP_EMBEDDED_SIGNUP_REGISTRATION_PIN_ENV,
  type WhatsAppEmbeddedSignupLaunchExtras,
  type WhatsAppEmbeddedSignupOnboardingMode,
} from "./whatsapp-embedded-signup-flags.js";
import { mapMetaEmbeddedSignupGraphError } from "./whatsapp-embedded-signup-meta-errors.js";
import { maybeSubscribeWabaToWebhook } from "./whatsapp-embedded-signup-waba-subscribe.js";
import { recordWhatsAppReconnectEvent } from "./whatsapp-connection-lifecycle.js";

const STATE_TTL_MS = 15 * 60 * 1000;

export type { WhatsAppEmbeddedSignupOnboardingMode };

export type WhatsAppEmbeddedSignupSessionResult = {
  enabled: true;
  appId: string;
  configId: string;
  state: string;
  graphApiVersion: string;
  coexistenceEnabled: boolean;
  /** Public only — never include app secret. */
  featureType: "whatsapp_business_app_onboarding" | null;
  onboardingMode: WhatsAppEmbeddedSignupOnboardingMode;
  /** Meta Embedded Signup protocol — v4 launch extras only. */
  embeddedSignupVersion: typeof WHATSAPP_EMBEDDED_SIGNUP_PROTOCOL_VERSION;
  /** Exact FB.login extras the browser must send (no client-side v2/v3 knobs). */
  launchExtras: WhatsAppEmbeddedSignupLaunchExtras;
};

export type WhatsAppEmbeddedSignupCompleteInput = {
  companyId: string;
  userId: string | null;
  code: string;
  state: string;
  /** Required for Option B. Optional for Coexistence — resolved via Graph WABA phone_numbers when omitted. */
  phoneNumberId: string;
  businessAccountId: string;
  businessPortfolioId?: string | null;
  replaceExisting?: boolean;
  coexistenceEligible?: boolean | null;
};

export type WhatsAppCoexistenceSyncResult = {
  contacts: { attempted: boolean; ok: boolean; requestId?: string; error?: string };
  history: { attempted: boolean; ok: boolean; requestId?: string; error?: string };
};

export type WhatsAppEmbeddedSignupCredentialStatus = "persisted" | "already_persisted";

export type WhatsAppEmbeddedSignupCompleteResult = {
  /** Credentials + channel refs persisted. Does NOT mean webhook-subscribed. */
  ok: true;
  credentialStatus: WhatsAppEmbeddedSignupCredentialStatus;
  webhookSubscriptionStatus: Awaited<
    ReturnType<typeof maybeSubscribeWabaToWebhook>
  >["status"];
  phoneNumberId: string;
  businessAccountId: string;
  onboardingMethod: "embedded_signup";
  subscription: Awaited<ReturnType<typeof maybeSubscribeWabaToWebhook>>;
  connectionTestOk: boolean | null;
  /**
   * True only when credentials persisted AND webhook subscription is
   * already_subscribed | subscribed. Never true solely because secrets were saved.
   */
  fullyOnboarded: boolean;
  coexistenceSync?: WhatsAppCoexistenceSyncResult | null;
  /** True when complete was a no-op replay of an already-matching connection. */
  idempotentReplay?: boolean;
};

export class WhatsAppEmbeddedSignupError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = "WhatsAppEmbeddedSignupError";
  }
}

export type WhatsAppEmbeddedSignupDeps = {
  client: SupabaseClient;
  fetchImpl?: typeof fetch;
  nowMs?: () => number;
  stateSecret?: string;
};

type StatePayload = {
  companyId: string;
  userId: string | null;
  nonce: string;
  exp: number;
  onboardingMode: WhatsAppEmbeddedSignupOnboardingMode;
};

function resolveStateSecret(explicit?: string): string {
  const fromEnv =
    String(process.env.META_EMBEDDED_SIGNUP_STATE_SECRET ?? "").trim() ||
    String(process.env.META_EMBEDDED_SIGNUP_APP_SECRET ?? "").trim() ||
    String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const secret = (explicit ?? fromEnv).trim();
  if (!secret) {
    throw new WhatsAppEmbeddedSignupError(
      "Embedded Signup state signing secret is not configured.",
      "ES_STATE_SECRET_MISSING",
      503,
    );
  }
  return secret;
}

function signState(payload: StatePayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyAndParseState(
  state: string,
  secret: string,
  expectedCompanyId: string,
  nowMs: number,
): StatePayload {
  const parts = state.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new WhatsAppEmbeddedSignupError("Invalid Embedded Signup state.", "ES_STATE_INVALID", 400);
  }
  const [body, sig] = parts;
  const expectedSig = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new WhatsAppEmbeddedSignupError("Invalid Embedded Signup state signature.", "ES_STATE_INVALID", 400);
  }

  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
  } catch {
    throw new WhatsAppEmbeddedSignupError("Invalid Embedded Signup state payload.", "ES_STATE_INVALID", 400);
  }

  if (!payload?.companyId || typeof payload.exp !== "number") {
    throw new WhatsAppEmbeddedSignupError("Invalid Embedded Signup state payload.", "ES_STATE_INVALID", 400);
  }
  if (payload.companyId !== expectedCompanyId) {
    throw new WhatsAppEmbeddedSignupError(
      "Embedded Signup state company mismatch.",
      "ES_STATE_COMPANY_MISMATCH",
      403,
    );
  }
  if (payload.exp < nowMs) {
    throw new WhatsAppEmbeddedSignupError("Embedded Signup state expired.", "ES_STATE_EXPIRED", 400);
  }
  const onboardingMode: WhatsAppEmbeddedSignupOnboardingMode =
    payload.onboardingMode === "coexistence" ? "coexistence" : "cloud_api_new";
  return {
    companyId: payload.companyId,
    userId: payload.userId ?? null,
    nonce: String(payload.nonce ?? ""),
    exp: payload.exp,
    onboardingMode,
  };
}

function generateVerifyToken(): string {
  return `valueor-wa-${randomBytes(18).toString("hex")}`;
}

function resolveWebhookCallbackUrl(): string {
  const fromEnv =
    String(process.env.PUBLIC_WEBHOOK_BASE_URL ?? "").trim() ||
    String(process.env.WEBHOOK_BASE_URL ?? "").trim() ||
    String(process.env.VITE_WEBHOOK_BASE_URL ?? "").trim();
  const base = fromEnv.replace(/\/$/, "");
  if (!base) {
    return "";
  }
  return `${base}/api/webhooks/whatsapp`;
}

async function exchangeAuthorizationCode(input: {
  code: string;
  appId: string;
  appSecret: string;
  graphApiVersion: string;
  fetchImpl: typeof fetch;
}): Promise<string> {
  const url = new URL(`https://graph.facebook.com/${input.graphApiVersion}/oauth/access_token`);
  url.searchParams.set("client_id", input.appId);
  url.searchParams.set("client_secret", input.appSecret);
  url.searchParams.set("code", input.code);

  const response = await input.fetchImpl(url.toString(), { method: "GET" });
  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    error?: { message?: string; code?: number; error_subcode?: number };
  };

  if (!response.ok || !payload.access_token?.trim()) {
    const mapped = mapMetaEmbeddedSignupGraphError(
      payload,
      "Meta authorization code exchange failed.",
    );
    throw new WhatsAppEmbeddedSignupError(
      mapped.message,
      mapped.code === "ES_META_GRAPH_ERROR" ? "ES_CODE_EXCHANGE_FAILED" : mapped.code,
      400,
    );
  }
  return payload.access_token.trim();
}

function buildSkippedSubscriptionResult(): Awaited<ReturnType<typeof maybeSubscribeWabaToWebhook>> {
  return {
    status: "skipped_flag_off",
    attempted: false,
    ok: false,
    error: null,
    graphHttpStatus: null,
    graphErrorCode: null,
    graphIsTransient: null,
    attempts: 0,
    persistenceHint: {
      webhook_subscription_status: "skipped_flag_off",
      webhook_subscribed_at: null,
      webhook_subscription_error: null,
      webhook_subscription_app_id: null,
      webhook_override_used: false,
      last_subscribed_apps_check_at: null,
    },
  };
}

export async function createWhatsAppEmbeddedSignupSession(
  input: {
    companyId: string;
    userId: string | null;
    /** cloud_api_new = Option B; coexistence = Option A (Meta-owned QR when eligible). */
    onboardingMode?: WhatsAppEmbeddedSignupOnboardingMode | null;
  },
  deps: Pick<WhatsAppEmbeddedSignupDeps, "nowMs" | "stateSecret"> = {},
): Promise<WhatsAppEmbeddedSignupSessionResult> {
  if (!isWhatsAppEmbeddedSignupEnabled()) {
    throw new WhatsAppEmbeddedSignupError(
      "WhatsApp Embedded Signup is disabled.",
      "ES_DISABLED",
      403,
    );
  }

  if (!isWhatsAppEmbeddedSignupCompanyAllowed(input.companyId)) {
    throw new WhatsAppEmbeddedSignupError(
      "WhatsApp Embedded Signup is not available for this company.",
      "ES_COMPANY_NOT_ALLOWED",
      403,
    );
  }

  const meta = readMetaEmbeddedSignupEnvConfig();
  if (!meta) {
    throw new WhatsAppEmbeddedSignupError(
      "Meta Embedded Signup is not configured (META_EMBEDDED_SIGNUP_APP_ID / META_EMBEDDED_SIGNUP_APP_SECRET). Feature remains closed until Meta credentials are set.",
      "ES_META_CONFIG_MISSING",
      503,
    );
  }

  const mode: WhatsAppEmbeddedSignupOnboardingMode =
    input.onboardingMode === "coexistence" ? "coexistence" : "cloud_api_new";

  const coexistenceEnabled = isWhatsAppCoexistenceEnabled();
  if (mode === "coexistence" && !coexistenceEnabled) {
    throw new WhatsAppEmbeddedSignupError(
      "WhatsApp Business App Coexistence onboarding is disabled for this environment.",
      "ES_COEXISTENCE_DISABLED",
      403,
    );
  }

  // Path-specific FLB v4 configuration ID. Never fall back to the other path or legacy CONFIG_ID.
  const configId = readMetaEmbeddedSignupConfigIdForMode(mode);
  if (!configId) {
    const envName =
      mode === "coexistence"
        ? META_EMBEDDED_SIGNUP_COEXISTENCE_CONFIG_ID_ENV
        : META_EMBEDDED_SIGNUP_CLOUD_API_CONFIG_ID_ENV;
    throw new WhatsAppEmbeddedSignupError(
      mode === "coexistence"
        ? `Meta Coexistence Embedded Signup v4 configuration ID is not configured (${envName}). Create a Facebook Login for Business v4 configuration and set the env var — feature remains closed.`
        : `Meta Cloud API Embedded Signup v4 configuration ID is not configured (${envName}). Create a Facebook Login for Business v4 configuration and set the env var — feature remains closed.`,
      "ES_META_CONFIG_ID_MISSING",
      503,
    );
  }

  const featureType: "whatsapp_business_app_onboarding" | null =
    mode === "coexistence" ? "whatsapp_business_app_onboarding" : null;
  const launchExtras = buildWhatsAppEmbeddedSignupV4LaunchExtras({
    onboardingMode: mode,
    featureType,
  });

  const nowMs = deps.nowMs?.() ?? Date.now();
  const secret = resolveStateSecret(deps.stateSecret);
  const state = signState(
    {
      companyId: input.companyId,
      userId: input.userId,
      nonce: randomBytes(12).toString("hex"),
      exp: nowMs + STATE_TTL_MS,
      onboardingMode: mode,
    },
    secret,
  );

  return {
    enabled: true,
    appId: meta.appId,
    configId,
    state,
    graphApiVersion: meta.graphApiVersion,
    coexistenceEnabled,
    featureType,
    onboardingMode: mode,
    embeddedSignupVersion: WHATSAPP_EMBEDDED_SIGNUP_PROTOCOL_VERSION,
    launchExtras,
  };
}

export async function completeWhatsAppEmbeddedSignup(
  input: WhatsAppEmbeddedSignupCompleteInput,
  deps: WhatsAppEmbeddedSignupDeps,
): Promise<WhatsAppEmbeddedSignupCompleteResult> {
  if (!isWhatsAppEmbeddedSignupEnabled()) {
    throw new WhatsAppEmbeddedSignupError(
      "WhatsApp Embedded Signup is disabled.",
      "ES_DISABLED",
      403,
    );
  }

  const companyId = input.companyId.trim();
  if (!isWhatsAppEmbeddedSignupCompanyAllowed(companyId)) {
    throw new WhatsAppEmbeddedSignupError(
      "WhatsApp Embedded Signup is not available for this company.",
      "ES_COMPANY_NOT_ALLOWED",
      403,
    );
  }

  const code = input.code.trim();
  const state = input.state.trim();
  let phoneNumberId = input.phoneNumberId.trim();
  const businessAccountId = input.businessAccountId.trim();
  const coexistenceEligible = input.coexistenceEligible === true;

  if (!companyId || !code || !state || !businessAccountId) {
    throw new WhatsAppEmbeddedSignupError(
      "code, state, and businessAccountId are required.",
      "ES_INVALID_REQUEST",
      400,
    );
  }
  if (!phoneNumberId && !coexistenceEligible) {
    throw new WhatsAppEmbeddedSignupError(
      "phoneNumberId is required for Cloud API Embedded Signup.",
      "ES_INVALID_REQUEST",
      400,
    );
  }

  const nowMs = deps.nowMs?.() ?? Date.now();
  const secret = resolveStateSecret(deps.stateSecret);
  const statePayload = verifyAndParseState(state, secret, companyId, nowMs);

  if (statePayload.onboardingMode === "coexistence" && !coexistenceEligible) {
    throw new WhatsAppEmbeddedSignupError(
      "Embedded Signup state was issued for Coexistence but complete payload is not coexistenceEligible.",
      "ES_STATE_MODE_MISMATCH",
      400,
    );
  }
  if (statePayload.onboardingMode === "cloud_api_new" && coexistenceEligible) {
    throw new WhatsAppEmbeddedSignupError(
      "Embedded Signup state was issued for Cloud API but complete payload requested coexistence.",
      "ES_STATE_MODE_MISMATCH",
      400,
    );
  }
  if (statePayload.onboardingMode === "coexistence" && !isWhatsAppCoexistenceEnabled()) {
    throw new WhatsAppEmbeddedSignupError(
      "WhatsApp Business App Coexistence onboarding is disabled for this environment.",
      "ES_COEXISTENCE_DISABLED",
      403,
    );
  }

  const meta = readMetaEmbeddedSignupEnvConfig();
  if (!meta) {
    throw new WhatsAppEmbeddedSignupError(
      "Meta Embedded Signup is not configured (META_EMBEDDED_SIGNUP_APP_ID / META_EMBEDDED_SIGNUP_APP_SECRET). Feature remains closed until Meta credentials are set.",
      "ES_META_CONFIG_MISSING",
      503,
    );
  }

  // Ensure the path-specific v4 CONFIG_ID is still present at complete time.
  const configId = readMetaEmbeddedSignupConfigIdForMode(statePayload.onboardingMode);
  if (!configId) {
    const envName =
      statePayload.onboardingMode === "coexistence"
        ? META_EMBEDDED_SIGNUP_COEXISTENCE_CONFIG_ID_ENV
        : META_EMBEDDED_SIGNUP_CLOUD_API_CONFIG_ID_ENV;
    throw new WhatsAppEmbeddedSignupError(
      `Meta Embedded Signup v4 configuration ID is not configured (${envName}). Feature remains closed.`,
      "ES_META_CONFIG_ID_MISSING",
      503,
    );
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const client = deps.client;

  const { data: existingSettings, error: settingsError } = await client.rpc(
    "get_company_whatsapp_settings",
    { p_company_id: companyId },
  );
  if (settingsError) {
    throw new WhatsAppEmbeddedSignupError(settingsError.message, "ES_SETTINGS_READ_FAILED", 500);
  }

  const existing = (existingSettings ?? {}) as Record<string, unknown>;
  const existingPhone = String(existing.phone_number_id ?? "").trim();
  const existingWaba = String(existing.business_account_id ?? "").trim();
  const hasExistingConnection =
    Boolean(existing.has_access_token) ||
    Boolean(existingPhone) ||
    Boolean(existingWaba);

  // Idempotent replay: same company already bound to the same phone + WABA.
  if (
    hasExistingConnection &&
    input.replaceExisting !== true &&
    phoneNumberId &&
    existingPhone === phoneNumberId &&
    existingWaba === businessAccountId &&
    Boolean(existing.has_access_token)
  ) {
    const skipped = buildSkippedSubscriptionResult();
    await upsertEmbeddedSignupMetadata(client, {
      companyId,
      userId: input.userId,
      status: "completed_idempotent",
      metaAppId: meta.appId,
      phoneNumberId,
      businessAccountId,
      businessPortfolioId: input.businessPortfolioId ?? null,
      coexistenceEligible: input.coexistenceEligible ?? null,
      lastError: null,
      completed: true,
    });
    return {
      ok: true,
      credentialStatus: "already_persisted",
      webhookSubscriptionStatus: skipped.status,
      phoneNumberId,
      businessAccountId,
      onboardingMethod: "embedded_signup",
      subscription: skipped,
      connectionTestOk: null,
      fullyOnboarded: false,
      coexistenceSync: null,
      idempotentReplay: true,
    };
  }

  if (hasExistingConnection && input.replaceExisting !== true) {
    await upsertEmbeddedSignupMetadata(client, {
      companyId,
      userId: input.userId,
      status: "blocked_existing_connection",
      metaAppId: meta.appId,
      phoneNumberId,
      businessAccountId,
      businessPortfolioId: input.businessPortfolioId ?? null,
      coexistenceEligible: input.coexistenceEligible ?? null,
      lastError: "Company already has a WhatsApp connection. Explicit replaceExisting is required.",
    });
    throw new WhatsAppEmbeddedSignupError(
      "This company already has a WhatsApp connection. Manual/existing credentials were not overwritten.",
      "ES_CONNECTION_EXISTS",
      409,
    );
  }

  const assertPhoneNotInUse = async (candidatePhoneNumberId: string) => {
    const { data: duplicateRows, error: duplicateError } = await client
      .from("company_whatsapp_settings")
      .select("company_id, phone_number_id")
      .eq("phone_number_id", candidatePhoneNumberId)
      .neq("company_id", companyId)
      .limit(5);

    if (duplicateError) {
      throw new WhatsAppEmbeddedSignupError(duplicateError.message, "ES_DUPLICATE_CHECK_FAILED", 500);
    }
    if (Array.isArray(duplicateRows) && duplicateRows.length > 0) {
      throw new WhatsAppEmbeddedSignupError(
        "This phone_number_id is already connected to another company.",
        "ES_PHONE_IN_USE",
        409,
      );
    }
  };

  // When Meta already returned phone_number_id, enforce tenant isolation before code exchange.
  if (phoneNumberId) {
    await assertPhoneNotInUse(phoneNumberId);
  }

  const accessToken = await exchangeAuthorizationCode({
    code,
    appId: meta.appId,
    appSecret: meta.appSecret,
    graphApiVersion: meta.graphApiVersion,
    fetchImpl,
  });

  // Coexistence FINISH event may only return waba_id; resolve phone_number_id via Graph.
  if (!phoneNumberId) {
    phoneNumberId = await resolvePhoneNumberIdForWaba({
      wabaId: businessAccountId,
      accessToken,
      graphApiVersion: meta.graphApiVersion,
      fetchImpl,
    });
    await assertPhoneNotInUse(phoneNumberId);
  }

  const existingVerifyPresent = Boolean(existing.has_webhook_verify_token);
  // Never rotate an existing verify token — preserves Production webhook verification.
  const webhookVerifyToken = existingVerifyPresent ? "" : generateVerifyToken();
  const webhookCallbackUrl =
    String(existing.webhook_callback_url ?? "").trim() || resolveWebhookCallbackUrl();
  const apiVersion = String(existing.api_version ?? "").trim() || meta.graphApiVersion || "v21.0";
  const defaultLanguage = String(existing.default_language ?? "en").trim() || "en";
  const maxRetryCount = Number(existing.max_retry_count ?? 3) || 3;

  const { error: upsertError } = await client.rpc("upsert_company_whatsapp_settings", {
    p_company_id: companyId,
    p_enabled: true,
    p_provider: "meta_cloud",
    p_access_token: accessToken,
    p_phone_number_id: phoneNumberId,
    p_business_account_id: businessAccountId,
    p_webhook_verify_token: webhookVerifyToken,
    p_default_language: defaultLanguage,
    p_max_retry_count: maxRetryCount,
    p_api_version: apiVersion,
    // Persist Meta app secret so webhook HMAC verification works for this tenant.
    // Never returned to the client.
    p_app_secret: meta.appSecret,
    p_webhook_callback_url: webhookCallbackUrl,
  });

  if (upsertError) {
    await upsertEmbeddedSignupMetadata(client, {
      companyId,
      userId: input.userId,
      status: "failed",
      metaAppId: meta.appId,
      phoneNumberId,
      businessAccountId,
      businessPortfolioId: input.businessPortfolioId ?? null,
      coexistenceEligible: input.coexistenceEligible ?? null,
      lastError: upsertError.message,
    });
    throw new WhatsAppEmbeddedSignupError(upsertError.message, "ES_CREDENTIAL_PERSIST_FAILED", 500);
  }

  try {
    await recordWhatsAppReconnectEvent(
      {
        companyId,
        source: "embedded_signup",
        phoneNumberId,
        businessAccountId,
        actorUserId: input.userId,
      },
      client,
    );
  } catch {
    // Audit must not block a successful credential persist.
  }

  const { error: syncError } = await client.rpc("sync_whatsapp_channel_references", {
    p_company_id: companyId,
  });
  if (syncError) {
    await upsertEmbeddedSignupMetadata(client, {
      companyId,
      userId: input.userId,
      status: "failed",
      metaAppId: meta.appId,
      phoneNumberId,
      businessAccountId,
      businessPortfolioId: input.businessPortfolioId ?? null,
      coexistenceEligible: input.coexistenceEligible ?? null,
      lastError: syncError.message,
    });
    throw new WhatsAppEmbeddedSignupError(syncError.message, "ES_CHANNEL_SYNC_FAILED", 500);
  }

  const subscription = await maybeSubscribeWabaToWebhook({
    wabaId: businessAccountId,
    accessToken,
    callbackUrl: webhookCallbackUrl,
    graphApiVersion: meta.graphApiVersion,
    targetAppId: meta.appId,
  });

  const webhookOk =
    subscription.status === "already_subscribed" || subscription.status === "subscribed";
  const subscribeSoftSkip =
    subscription.status === "skipped_flag_off" || subscription.status === "blocked_production";

  if (subscription.attempted && !subscription.ok && !subscribeSoftSkip) {
    const message =
      subscription.error ?? `Webhook subscription status: ${subscription.status}`;
    await upsertEmbeddedSignupMetadata(client, {
      companyId,
      userId: input.userId,
      status: "failed_webhook_subscribe",
      metaAppId: meta.appId,
      phoneNumberId,
      businessAccountId,
      businessPortfolioId: input.businessPortfolioId ?? null,
      coexistenceEligible: input.coexistenceEligible ?? null,
      lastError: message,
      completed: false,
    });
    throw new WhatsAppEmbeddedSignupError(
      message,
      "ES_WEBHOOK_SUBSCRIBE_FAILED",
      502,
    );
  }

  // Cloud API register is for Option B only. Meta docs: skip register for Coexistence numbers.
  // Never hardcode PIN "000000". Require an explicit 6-digit env PIN when register is enabled.
  if (!coexistenceEligible && isWhatsAppEmbeddedSignupRegisterPhoneEnabled()) {
    const pin = readWhatsAppEmbeddedSignupRegistrationPin();
    if (!pin) {
      throw new WhatsAppEmbeddedSignupError(
        `WHATSAPP_EMBEDDED_SIGNUP_REGISTER_PHONE is enabled but ${WHATSAPP_EMBEDDED_SIGNUP_REGISTRATION_PIN_ENV} is missing or not a 6-digit PIN. Registration was not attempted.`,
        "ES_REGISTER_PIN_MISSING",
        503,
      );
    }

    const registerUrl = `https://graph.facebook.com/${meta.graphApiVersion}/${encodeURIComponent(phoneNumberId)}/register`;
    let registerResponse: Response;
    try {
      registerResponse = await fetchImpl(registerUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messaging_product: "whatsapp", pin }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await upsertEmbeddedSignupMetadata(client, {
        companyId,
        userId: input.userId,
        status: "failed_register",
        metaAppId: meta.appId,
        phoneNumberId,
        businessAccountId,
        businessPortfolioId: input.businessPortfolioId ?? null,
        coexistenceEligible: false,
        lastError: message,
      });
      throw new WhatsAppEmbeddedSignupError(message, "ES_REGISTER_FAILED", 502);
    }

    const registerPayload = (await registerResponse.json().catch(() => ({}))) as {
      success?: boolean;
      error?: { message?: string };
    };
    if (!registerResponse.ok || registerPayload.success === false) {
      const message =
        registerPayload.error?.message ?? `Phone registration failed (HTTP ${registerResponse.status}).`;
      await upsertEmbeddedSignupMetadata(client, {
        companyId,
        userId: input.userId,
        status: "failed_register",
        metaAppId: meta.appId,
        phoneNumberId,
        businessAccountId,
        businessPortfolioId: input.businessPortfolioId ?? null,
        coexistenceEligible: false,
        lastError: message,
      });
      throw new WhatsAppEmbeddedSignupError(message, "ES_REGISTER_FAILED", 502);
    }
  }

  let connectionTestOk: boolean | null = null;
  try {
    const meUrl = new URL(`https://graph.facebook.com/${meta.graphApiVersion}/${encodeURIComponent(phoneNumberId)}`);
    meUrl.searchParams.set(
      "fields",
      coexistenceEligible
        ? "id,display_phone_number,verified_name,is_on_biz_app,platform_type"
        : "id,display_phone_number,verified_name",
    );
    const probe = await fetchImpl(meUrl.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    connectionTestOk = probe.ok;
  } catch {
    connectionTestOk = false;
  }

  // Official Coexistence: initiate contacts + history sync within 24h of onboarding.
  // Phase 1 keeps Coexistence closed by default; this path only runs when explicitly enabled.
  let coexistenceSync: WhatsAppCoexistenceSyncResult | null = null;
  if (coexistenceEligible) {
    coexistenceSync = await initiateCoexistenceSmbAppDataSync({
      phoneNumberId,
      accessToken,
      graphApiVersion: meta.graphApiVersion,
      fetchImpl,
    });
  }

  const coexistenceSyncError =
    coexistenceSync && (!coexistenceSync.contacts.ok || !coexistenceSync.history.ok)
      ? [
          coexistenceSync.contacts.ok ? null : `contacts:${coexistenceSync.contacts.error ?? "failed"}`,
          coexistenceSync.history.ok ? null : `history:${coexistenceSync.history.error ?? "failed"}`,
        ]
          .filter(Boolean)
          .join("; ")
      : null;

  const metadataError =
    webhookOk || subscribeSoftSkip
      ? null
      : subscription.error ?? `Webhook subscription status: ${subscription.status}`;

  await upsertEmbeddedSignupMetadata(client, {
    companyId,
    userId: input.userId,
    status: "completed",
    metaAppId: meta.appId,
    phoneNumberId,
    businessAccountId,
    businessPortfolioId: input.businessPortfolioId ?? null,
    coexistenceEligible,
    coexistenceEnabled: isWhatsAppCoexistenceEnabled(),
    lastError: [metadataError, coexistenceSyncError].filter(Boolean).join(" | ") || null,
    completed: true,
  });

  return {
    ok: true,
    credentialStatus: "persisted",
    webhookSubscriptionStatus: subscription.status,
    phoneNumberId,
    businessAccountId,
    onboardingMethod: "embedded_signup",
    subscription,
    connectionTestOk,
    fullyOnboarded: webhookOk && connectionTestOk === true,
    coexistenceSync,
    idempotentReplay: false,
  };
}

async function resolvePhoneNumberIdForWaba(input: {
  wabaId: string;
  accessToken: string;
  graphApiVersion: string;
  fetchImpl: typeof fetch;
}): Promise<string> {
  const url = new URL(
    `https://graph.facebook.com/${input.graphApiVersion}/${encodeURIComponent(input.wabaId)}/phone_numbers`,
  );
  url.searchParams.set("fields", "id,display_phone_number,verified_name");
  const response = await input.fetchImpl(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: Array<{ id?: string }>;
    error?: { message?: string };
  };
  const id = payload.data?.find((row) => String(row.id ?? "").trim())?.id?.trim() ?? "";
  if (!response.ok || !id) {
    throw new WhatsAppEmbeddedSignupError(
      payload.error?.message ??
        "Could not resolve phone_number_id from WABA after Coexistence Embedded Signup.",
      "ES_PHONE_RESOLVE_FAILED",
      400,
    );
  }
  return id;
}

async function initiateCoexistenceSmbAppDataSync(input: {
  phoneNumberId: string;
  accessToken: string;
  graphApiVersion: string;
  fetchImpl: typeof fetch;
}): Promise<WhatsAppCoexistenceSyncResult> {
  const run = async (syncType: "smb_app_state_sync" | "history") => {
    try {
      const url = `https://graph.facebook.com/${input.graphApiVersion}/${encodeURIComponent(input.phoneNumberId)}/smb_app_data`;
      const response = await input.fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messaging_product: "whatsapp", sync_type: syncType }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        request_id?: string;
        error?: { message?: string };
      };
      if (!response.ok) {
        return {
          attempted: true,
          ok: false,
          error: payload.error?.message ?? `HTTP ${response.status}`,
        };
      }
      return { attempted: true, ok: true, requestId: payload.request_id };
    } catch (error) {
      return {
        attempted: true,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const contacts = await run("smb_app_state_sync");
  const history = await run("history");
  return { contacts, history };
}

async function upsertEmbeddedSignupMetadata(
  client: SupabaseClient,
  input: {
    companyId: string;
    userId: string | null;
    status: string;
    metaAppId: string;
    phoneNumberId: string;
    businessAccountId: string;
    businessPortfolioId?: string | null;
    coexistenceEligible?: boolean | null;
    coexistenceEnabled?: boolean;
    lastError?: string | null;
    completed?: boolean;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    company_id: input.companyId,
    onboarding_method: "embedded_signup",
    status: input.status,
    meta_app_id: input.metaAppId,
    business_portfolio_id: input.businessPortfolioId ?? null,
    phone_number_id: input.phoneNumberId,
    business_account_id: input.businessAccountId,
    coexistence_eligible: input.coexistenceEligible ?? null,
    coexistence_enabled: input.coexistenceEnabled ?? false,
    last_error: input.lastError ?? null,
    updated_by: input.userId,
    updated_at: now,
    started_at: now,
  };
  if (input.completed) {
    row.completed_at = now;
  }

  const { error } = await client.from("company_whatsapp_embedded_signup").upsert(row, {
    onConflict: "company_id",
  });
  if (error) {
    console.warn("[whatsapp.embedded-signup.metadata]", {
      companyId: input.companyId,
      status: input.status,
      error: error.message,
    });
  }
}

/** Test helpers */
export const __test = {
  signState,
  verifyAndParseState,
  resolveStateSecret,
  STATE_TTL_MS,
};
