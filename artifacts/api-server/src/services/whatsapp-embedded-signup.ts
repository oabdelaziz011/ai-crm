import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isWhatsAppCoexistenceEnabled,
  isWhatsAppEmbeddedSignupEnabled,
  readMetaEmbeddedSignupEnvConfig,
} from "./whatsapp-embedded-signup-flags.js";
import { maybeSubscribeWabaToWebhook } from "./whatsapp-embedded-signup-waba-subscribe.js";

const STATE_TTL_MS = 15 * 60 * 1000;

export type WhatsAppEmbeddedSignupSessionResult = {
  enabled: true;
  appId: string;
  configId: string;
  state: string;
  graphApiVersion: string;
  coexistenceEnabled: boolean;
  /** Public only — never include app secret. */
  featureType: "whatsapp_business_app_onboarding" | null;
};

export type WhatsAppEmbeddedSignupCompleteInput = {
  companyId: string;
  userId: string | null;
  code: string;
  state: string;
  phoneNumberId: string;
  businessAccountId: string;
  businessPortfolioId?: string | null;
  replaceExisting?: boolean;
  coexistenceEligible?: boolean | null;
};

export type WhatsAppEmbeddedSignupCredentialStatus = "persisted";

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
  return payload;
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
    error?: { message?: string };
  };

  if (!response.ok || !payload.access_token?.trim()) {
    throw new WhatsAppEmbeddedSignupError(
      payload.error?.message ?? "Meta authorization code exchange failed.",
      "ES_CODE_EXCHANGE_FAILED",
      400,
    );
  }
  return payload.access_token.trim();
}

export async function createWhatsAppEmbeddedSignupSession(
  input: { companyId: string; userId: string | null },
  deps: Pick<WhatsAppEmbeddedSignupDeps, "nowMs" | "stateSecret"> = {},
): Promise<WhatsAppEmbeddedSignupSessionResult> {
  if (!isWhatsAppEmbeddedSignupEnabled()) {
    throw new WhatsAppEmbeddedSignupError(
      "WhatsApp Embedded Signup is disabled.",
      "ES_DISABLED",
      403,
    );
  }

  const meta = readMetaEmbeddedSignupEnvConfig();
  if (!meta) {
    throw new WhatsAppEmbeddedSignupError(
      "Meta Embedded Signup is not configured (META_EMBEDDED_SIGNUP_APP_ID / APP_SECRET / CONFIG_ID).",
      "ES_META_CONFIG_MISSING",
      503,
    );
  }

  const nowMs = deps.nowMs?.() ?? Date.now();
  const secret = resolveStateSecret(deps.stateSecret);
  const state = signState(
    {
      companyId: input.companyId,
      userId: input.userId,
      nonce: randomBytes(12).toString("hex"),
      exp: nowMs + STATE_TTL_MS,
    },
    secret,
  );

  const coexistenceEnabled = isWhatsAppCoexistenceEnabled();

  return {
    enabled: true,
    appId: meta.appId,
    configId: meta.configId,
    state,
    graphApiVersion: meta.graphApiVersion,
    coexistenceEnabled,
    featureType: coexistenceEnabled ? "whatsapp_business_app_onboarding" : null,
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
  const code = input.code.trim();
  const state = input.state.trim();
  const phoneNumberId = input.phoneNumberId.trim();
  const businessAccountId = input.businessAccountId.trim();

  if (!companyId || !code || !state || !phoneNumberId || !businessAccountId) {
    throw new WhatsAppEmbeddedSignupError(
      "code, state, phoneNumberId, and businessAccountId are required.",
      "ES_INVALID_REQUEST",
      400,
    );
  }

  const nowMs = deps.nowMs?.() ?? Date.now();
  const secret = resolveStateSecret(deps.stateSecret);
  verifyAndParseState(state, secret, companyId, nowMs);

  const meta = readMetaEmbeddedSignupEnvConfig();
  if (!meta) {
    throw new WhatsAppEmbeddedSignupError(
      "Meta Embedded Signup is not configured (META_EMBEDDED_SIGNUP_APP_ID / APP_SECRET / CONFIG_ID).",
      "ES_META_CONFIG_MISSING",
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
  const hasExistingConnection =
    Boolean(existing.has_access_token) ||
    Boolean(existingPhone) ||
    Boolean(String(existing.business_account_id ?? "").trim());

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

  const { data: duplicateRows, error: duplicateError } = await client
    .from("company_whatsapp_settings")
    .select("company_id, phone_number_id")
    .eq("phone_number_id", phoneNumberId)
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

  const accessToken = await exchangeAuthorizationCode({
    code,
    appId: meta.appId,
    appSecret: meta.appSecret,
    graphApiVersion: meta.graphApiVersion,
    fetchImpl,
  });

  const existingVerifyPresent = Boolean(existing.has_webhook_verify_token);
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
    // Empty app secret preserves existing encrypted secret (same Manual semantics).
    p_app_secret: "",
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
  // Credentials are persisted regardless of subscription outcome.
  // Subscription columns are not on the side table yet — record a non-secret hint in last_error
  // when subscribe did not succeed (except intentional flag-off skip).
  const metadataError =
    webhookOk || subscription.status === "skipped_flag_off"
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
    coexistenceEligible: input.coexistenceEligible ?? null,
    coexistenceEnabled: isWhatsAppCoexistenceEnabled(),
    lastError: metadataError,
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
    connectionTestOk: null,
    fullyOnboarded: webhookOk,
  };
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
