import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isMetaInstagramLoginCompanyAllowed,
  isMetaInstagramLoginEnabled,
  listMissingMetaInstagramLoginEnvKeys,
  META_INSTAGRAM_LOGIN_SCOPES,
  readMetaInstagramLoginEnvConfig,
} from "./meta-instagram-login-flags.js";
import {
  createMetaOauthState,
  MetaOauthStateError,
  resolveLoginAppBaseUrl,
  resolveMetaOauthStateSecret,
  resolvePublicApiBaseUrl,
  sanitizeGraphVersion,
  verifyMetaOauthState,
} from "./meta-oauth-state.js";
import {
  assertCanClearMetaCredentials,
  assertCanReplaceExistingMetaConnection,
  readCredentialSource,
  type ExistingMetaChannelConnection,
  type MetaCredentialSource,
} from "./meta-oauth-connection-guard.js";

export const META_INSTAGRAM_LOGIN_FLOW = "instagram_login";

export type MetaConnectionStatus =
  | "connected"
  | "not_connected"
  | "connection_expired"
  | "reauthorization_required"
  | "webhook_subscription_failed";

export class MetaInstagramLoginError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = "MetaInstagramLoginError";
  }
}

export type MetaInstagramLoginDeps = {
  client: SupabaseClient;
  fetchImpl?: typeof fetch;
  nowMs?: () => number;
  stateSecret?: string;
};

type ShortLivedToken = {
  accessToken: string;
  userId: string;
  permissions: string[];
};

type LongLivedToken = {
  accessToken: string;
  expiresIn: number;
};

type IgAccountProfile = {
  id: string;
  username: string;
  accountType: string | null;
};

function mapStateError(error: unknown): never {
  if (error instanceof MetaOauthStateError) {
    throw new MetaInstagramLoginError(error.message, error.code, error.statusCode);
  }
  throw error;
}

function mapGuardError(error: unknown): never {
  if (error && typeof error === "object" && "code" in error && "statusCode" in error) {
    const err = error as { message: string; code: string; statusCode: number };
    throw new MetaInstagramLoginError(err.message, err.code, err.statusCode);
  }
  throw error;
}

async function loadExistingInstagramConnection(
  client: SupabaseClient,
  companyId: string,
): Promise<ExistingMetaChannelConnection | null> {
  const { data, error } = await client
    .from("company_instagram_settings")
    .select(
      "enabled,instagram_business_account_id,access_token_encrypted,access_token,credential_source,oauth_mode",
    )
    .eq("company_id", companyId)
    .maybeSingle();
  if (error || !data) return null;
  const source =
    readCredentialSource(data.credential_source) === "oauth" ||
    String(data.oauth_mode ?? "") === "instagram_login"
      ? "oauth"
      : "manual";
  return {
    enabled: Boolean(data.enabled),
    pageOrAccountId: data.instagram_business_account_id
      ? String(data.instagram_business_account_id)
      : null,
    hasAccessToken:
      Boolean(data.access_token_encrypted) || Boolean(String(data.access_token ?? "").trim()),
    credentialSource: source,
  };
}

function assertEnabledAndAllowed(companyId: string): void {
  if (!isMetaInstagramLoginEnabled()) {
    throw new MetaInstagramLoginError("Instagram Login OAuth is disabled.", "IGL_DISABLED", 403);
  }
  if (!isMetaInstagramLoginCompanyAllowed(companyId)) {
    throw new MetaInstagramLoginError(
      "Instagram Login OAuth is not available for this company.",
      "IGL_COMPANY_NOT_ALLOWED",
      403,
    );
  }
}

export function buildMetaInstagramLoginReadiness(companyId: string) {
  if (!isMetaInstagramLoginEnabled()) {
    return {
      ready: false,
      companyAllowed: false,
      reason: "IGL_DISABLED" as const,
      missingConfigKeys: [] as string[],
    };
  }
  const companyAllowed = isMetaInstagramLoginCompanyAllowed(companyId);
  if (!companyAllowed) {
    return {
      ready: false,
      companyAllowed: false,
      reason: "IGL_COMPANY_NOT_ALLOWED" as const,
      missingConfigKeys: [] as string[],
    };
  }
  const missingConfigKeys = listMissingMetaInstagramLoginEnvKeys();
  const meta = readMetaInstagramLoginEnvConfig(resolvePublicApiBaseUrl());
  if (!meta || missingConfigKeys.length > 0) {
    return {
      ready: false,
      companyAllowed: true,
      reason: "IGL_META_CONFIG_MISSING" as const,
      missingConfigKeys,
    };
  }
  return {
    ready: true,
    companyAllowed: true,
    reason: null,
    missingConfigKeys: [] as string[],
    redirectUri: meta.redirectUri,
    scopes: [...META_INSTAGRAM_LOGIN_SCOPES],
    graphApiVersion: sanitizeGraphVersion(meta.graphApiVersion),
  };
}

export function startMetaInstagramLogin(input: {
  companyId: string;
  userId: string | null;
  confirmReplaceExisting?: boolean;
  deps?: Pick<MetaInstagramLoginDeps, "nowMs" | "stateSecret">;
}): { authorizeUrl: string; state: string; redirectUri: string; scopes: readonly string[] } {
  assertEnabledAndAllowed(input.companyId);
  const meta = readMetaInstagramLoginEnvConfig(resolvePublicApiBaseUrl());
  if (!meta) {
    throw new MetaInstagramLoginError(
      "Instagram Login app credentials are missing.",
      "IGL_META_CONFIG_MISSING",
      503,
    );
  }
  let secret: string;
  try {
    secret = resolveMetaOauthStateSecret(input.deps?.stateSecret);
  } catch (error) {
    mapStateError(error);
  }
  const state = createMetaOauthState({
    companyId: input.companyId,
    userId: input.userId,
    flow: META_INSTAGRAM_LOGIN_FLOW,
    secret,
    nowMs: input.deps?.nowMs?.(),
    confirmReplaceExisting: Boolean(input.confirmReplaceExisting),
  });
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", meta.appId);
  url.searchParams.set("redirect_uri", meta.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", META_INSTAGRAM_LOGIN_SCOPES.join(","));
  url.searchParams.set("state", state);
  url.searchParams.set("enable_fb_login", "0");
  return {
    authorizeUrl: url.toString(),
    state,
    redirectUri: meta.redirectUri,
    scopes: META_INSTAGRAM_LOGIN_SCOPES,
  };
}

function stripAuthCode(raw: string): string {
  // Instagram appends #_ to the redirect; some browsers leave it on the code.
  return raw.replace(/#_$/, "").trim();
}

async function exchangeCodeForShortLivedToken(
  code: string,
  meta: NonNullable<ReturnType<typeof readMetaInstagramLoginEnvConfig>>,
  fetchImpl: typeof fetch,
): Promise<ShortLivedToken> {
  const body = new URLSearchParams({
    client_id: meta.appId,
    client_secret: meta.appSecret,
    grant_type: "authorization_code",
    redirect_uri: meta.redirectUri,
    code: stripAuthCode(code),
  });
  const res = await fetchImpl("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const json = (await res.json()) as {
    access_token?: string;
    user_id?: string | number;
    permissions?: string | string[];
    data?: Array<{
      access_token?: string;
      user_id?: string | number;
      permissions?: string | string[];
    }>;
    error_message?: string;
    error?: { message?: string };
  };
  const row = json.data?.[0] ?? json;
  const accessToken = String(row.access_token ?? "").trim();
  const userId = String(row.user_id ?? "").trim();
  if (!res.ok || !accessToken || !userId) {
    throw new MetaInstagramLoginError(
      json.error_message ?? json.error?.message ?? "Failed to exchange Instagram authorization code.",
      "IGL_CODE_EXCHANGE_FAILED",
      400,
    );
  }
  const permissionsRaw = row.permissions ?? [];
  const permissions = Array.isArray(permissionsRaw)
    ? permissionsRaw.map(String)
    : String(permissionsRaw)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  return { accessToken, userId, permissions };
}

async function exchangeForLongLivedToken(
  shortLivedToken: string,
  meta: NonNullable<ReturnType<typeof readMetaInstagramLoginEnvConfig>>,
  fetchImpl: typeof fetch,
): Promise<LongLivedToken> {
  const url = new URL("https://graph.instagram.com/access_token");
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", meta.appSecret);
  url.searchParams.set("access_token", shortLivedToken);
  const res = await fetchImpl(url.toString(), { headers: { Accept: "application/json" } });
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!res.ok || !json.access_token) {
    throw new MetaInstagramLoginError(
      json.error?.message ?? "Failed to exchange for long-lived Instagram token.",
      "IGL_LONG_LIVED_EXCHANGE_FAILED",
      400,
    );
  }
  return {
    accessToken: json.access_token,
    expiresIn: typeof json.expires_in === "number" ? json.expires_in : 60 * 24 * 60 * 60,
  };
}

export async function refreshMetaInstagramLongLivedToken(input: {
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<LongLivedToken> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", input.accessToken);
  const res = await fetchImpl(url.toString(), { headers: { Accept: "application/json" } });
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!res.ok || !json.access_token) {
    throw new MetaInstagramLoginError(
      json.error?.message ?? "Failed to refresh Instagram long-lived token.",
      "IGL_TOKEN_REFRESH_FAILED",
      400,
    );
  }
  return {
    accessToken: json.access_token,
    expiresIn: typeof json.expires_in === "number" ? json.expires_in : 60 * 24 * 60 * 60,
  };
}

async function fetchIgAccountProfile(
  accessToken: string,
  graphApiVersion: string,
  fetchImpl: typeof fetch,
): Promise<IgAccountProfile> {
  const version = sanitizeGraphVersion(graphApiVersion);
  const url = new URL(`https://graph.instagram.com/${version}/me`);
  url.searchParams.set("fields", "user_id,username,account_type,name");
  url.searchParams.set("access_token", accessToken);
  const res = await fetchImpl(url.toString(), { headers: { Accept: "application/json" } });
  const json = (await res.json()) as {
    user_id?: string | number;
    id?: string | number;
    username?: string;
    account_type?: string;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new MetaInstagramLoginError(
      json.error?.message ?? "Failed to load Instagram account profile.",
      "IGL_PROFILE_FAILED",
      400,
    );
  }
  const id = String(json.user_id ?? json.id ?? "").trim();
  const username = String(json.username ?? "").trim();
  if (!id) {
    throw new MetaInstagramLoginError(
      "Instagram professional account id missing from profile response.",
      "IGL_PROFILE_MISSING_ID",
      400,
    );
  }
  return {
    id,
    username: username || id,
    accountType: json.account_type ? String(json.account_type) : null,
  };
}

function assertProfessionalAccount(profile: IgAccountProfile): void {
  const type = (profile.accountType ?? "").toUpperCase();
  // PERSONAL is unsupported. BUSINESS / CREATOR / MEDIA_CREATOR are OK.
  // Some responses omit account_type for professional tokens — allow when username present.
  if (type === "PERSONAL") {
    throw new MetaInstagramLoginError(
      "Personal Instagram accounts are not supported. Switch to a Professional Business or Creator account.",
      "IGL_PERSONAL_ACCOUNT_UNSUPPORTED",
      400,
    );
  }
}

async function subscribeInstagramMessagingWebhooks(input: {
  igUserId: string;
  accessToken: string;
  graphApiVersion: string;
  fetchImpl: typeof fetch;
}): Promise<{ ok: boolean; error: string | null }> {
  const version = sanitizeGraphVersion(input.graphApiVersion);
  const url = new URL(
    `https://graph.instagram.com/${version}/${encodeURIComponent(input.igUserId)}/subscribed_apps`,
  );
  url.searchParams.set(
    "subscribed_fields",
    "messages,messaging_postbacks,messaging_seen,messaging_referral,message_reactions",
  );
  try {
    const res = await input.fetchImpl(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        Accept: "application/json",
      },
    });
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      error?: { message?: string };
    };
    if (!res.ok || json.success !== true) {
      return {
        ok: false,
        error: json.error?.message ?? `Instagram subscribed_apps failed (HTTP ${res.status})`,
      };
    }
    return { ok: true, error: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Instagram webhook subscription failed",
    };
  }
}

async function unsubscribeInstagramMessagingWebhooks(input: {
  igUserId: string;
  accessToken: string;
  graphApiVersion: string;
  fetchImpl: typeof fetch;
}): Promise<{ ok: boolean }> {
  const version = sanitizeGraphVersion(input.graphApiVersion);
  const url = new URL(
    `https://graph.instagram.com/${version}/${encodeURIComponent(input.igUserId)}/subscribed_apps`,
  );
  try {
    const res = await input.fetchImpl(url.toString(), {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        Accept: "application/json",
      },
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

async function persistInstagramConnection(input: {
  client: SupabaseClient;
  companyId: string;
  igUserId: string;
  username: string;
  accessToken: string;
  expiresIn: number;
  appSecret: string;
  graphApiVersion: string;
  webhookOk: boolean;
  webhookError: string | null;
  confirmReplaceExisting: boolean;
  healthOk: boolean;
}): Promise<{ verifyToken: string; connectionStatus: MetaConnectionStatus }> {
  const existingConnection = await loadExistingInstagramConnection(input.client, input.companyId);
  try {
    assertCanReplaceExistingMetaConnection({
      existing: existingConnection,
      confirmReplaceExisting: input.confirmReplaceExisting,
      channel: "instagram",
    });
  } catch (error) {
    mapGuardError(error);
  }

  // Preserve existing verify token on reconnect (empty → whatsapp_is_unchanged_secret).
  const { data: existing } = await input.client
    .from("company_instagram_settings")
    .select("webhook_verify_token_encrypted")
    .eq("company_id", input.companyId)
    .maybeSingle();
  const verifyToken = existing?.webhook_verify_token_encrypted
    ? ""
    : `vo_ig_${randomBytes(12).toString("hex")}`;

  const { error } = await input.client.rpc("upsert_company_instagram_settings", {
    p_company_id: input.companyId,
    p_enabled: true,
    p_provider: "meta_instagram",
    p_page_id: "",
    p_instagram_business_account_id: input.igUserId,
    p_access_token: input.accessToken,
    p_webhook_verify_token: verifyToken,
    p_api_version: sanitizeGraphVersion(input.graphApiVersion),
    p_app_secret: input.appSecret,
  });
  if (error) {
    throw new MetaInstagramLoginError(error.message, "IGL_PERSIST_FAILED", 500);
  }

  const connectionStatus: MetaConnectionStatus = !input.webhookOk
    ? "webhook_subscription_failed"
    : input.healthOk
      ? "connected"
      : "reauthorization_required";
  const tokenExpiresAt = new Date(Date.now() + input.expiresIn * 1000).toISOString();
  await input.client
    .from("company_instagram_settings")
    .update({
      oauth_mode: "instagram_login",
      credential_source: "oauth",
      instagram_username: input.username,
      token_expires_at: tokenExpiresAt,
      connection_status: connectionStatus,
      connection_last_error:
        input.webhookError ?? (input.healthOk ? "" : "Instagram token health check failed"),
      webhook_subscription_status: input.webhookOk ? "subscribed" : "failed",
      webhook_subscription_error: input.webhookError ?? "",
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", input.companyId);

  return { verifyToken, connectionStatus };
}

export async function handleMetaInstagramLoginCallback(input: {
  code: string | null;
  state: string | null;
  error: string | null;
  errorReason: string | null;
  deps: MetaInstagramLoginDeps;
}): Promise<{ redirectUrl: string }> {
  const frontend = resolveLoginAppBaseUrl();
  const settingsPath = `${frontend}/dashboard/settings/instagram`;

  if (input.error) {
    return {
      redirectUrl: `${settingsPath}?instagram_oauth=error&reason=${encodeURIComponent(input.errorReason || input.error)}`,
    };
  }
  if (!input.code || !input.state) {
    return {
      redirectUrl: `${settingsPath}?instagram_oauth=error&reason=missing_code`,
    };
  }

  const meta = readMetaInstagramLoginEnvConfig(resolvePublicApiBaseUrl());
  if (!meta) {
    return {
      redirectUrl: `${settingsPath}?instagram_oauth=error&reason=oauth_not_configured`,
    };
  }

  const nowMs = input.deps.nowMs?.() ?? Date.now();
  let payload;
  try {
    const secret = resolveMetaOauthStateSecret(input.deps.stateSecret);
    payload = verifyMetaOauthState(input.state, secret, META_INSTAGRAM_LOGIN_FLOW, nowMs);
  } catch (error) {
    const reason =
      error instanceof MetaOauthStateError ? error.code : "META_OAUTH_STATE_INVALID";
    return {
      redirectUrl: `${settingsPath}?instagram_oauth=error&reason=${encodeURIComponent(reason)}`,
    };
  }

  try {
    assertEnabledAndAllowed(payload.companyId);
    const fetchImpl = input.deps.fetchImpl ?? fetch;
    const shortLived = await exchangeCodeForShortLivedToken(input.code, meta, fetchImpl);
    const longLived = await exchangeForLongLivedToken(shortLived.accessToken, meta, fetchImpl);
    const profile = await fetchIgAccountProfile(
      longLived.accessToken,
      meta.graphApiVersion,
      fetchImpl,
    );
    assertProfessionalAccount(profile);
    const subscribe = await subscribeInstagramMessagingWebhooks({
      igUserId: profile.id,
      accessToken: longLived.accessToken,
      graphApiVersion: meta.graphApiVersion,
      fetchImpl,
    });
    let healthOk = false;
    try {
      const probe = new URL(
        `https://graph.instagram.com/${sanitizeGraphVersion(meta.graphApiVersion)}/${encodeURIComponent(profile.id)}`,
      );
      probe.searchParams.set("fields", "id,username");
      probe.searchParams.set("access_token", longLived.accessToken);
      const probeRes = await fetchImpl(probe.toString());
      healthOk = probeRes.ok;
    } catch {
      healthOk = false;
    }
    const persisted = await persistInstagramConnection({
      client: input.deps.client,
      companyId: payload.companyId,
      igUserId: profile.id,
      username: profile.username,
      accessToken: longLived.accessToken,
      expiresIn: longLived.expiresIn,
      appSecret: meta.appSecret,
      graphApiVersion: meta.graphApiVersion,
      webhookOk: subscribe.ok,
      webhookError: subscribe.error,
      confirmReplaceExisting: Boolean(payload.confirmReplaceExisting),
      healthOk,
    });
    const qs = new URLSearchParams({
      instagram_oauth:
        persisted.connectionStatus === "connected"
          ? "connected"
          : persisted.connectionStatus === "webhook_subscription_failed"
            ? "webhook_failed"
            : "health_failed",
      username: profile.username,
      ig_user_id: profile.id,
      connection_status: persisted.connectionStatus,
    });
    return { redirectUrl: `${settingsPath}?${qs.toString()}` };
  } catch (error) {
    const code =
      error instanceof MetaInstagramLoginError ? error.code : "IGL_CALLBACK_FAILED";
    const message =
      error instanceof Error ? error.message : "Instagram Login callback failed";
    // Never put tokens in the redirect. Message is truncated / non-secret.
    const qs = new URLSearchParams({
      instagram_oauth: "error",
      reason: code,
      message: message.slice(0, 180),
    });
    // Do not overwrite status on blocked_existing — preserve the live connection.
    if (code !== "IGL_BLOCKED_EXISTING_CONNECTION") {
      try {
        await input.deps.client
          .from("company_instagram_settings")
          .update({
            connection_status: "reauthorization_required",
            connection_last_error: message.slice(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq("company_id", payload.companyId);
      } catch {
        // best-effort status write
      }
    }
    return { redirectUrl: `${settingsPath}?${qs.toString()}` };
  }
}

export async function getMetaInstagramLoginConnection(input: {
  companyId: string;
  deps: Pick<MetaInstagramLoginDeps, "client" | "nowMs">;
}): Promise<{
  status: MetaConnectionStatus;
  username: string | null;
  igUserId: string | null;
  oauthMode: string | null;
  tokenExpiresAt: string | null;
  webhookSubscriptionStatus: string | null;
  lastError: string | null;
  enabled: boolean;
  hasAccessToken: boolean;
  credentialSource: MetaCredentialSource;
}> {
  assertEnabledAndAllowed(input.companyId);
  const { data, error } = await input.deps.client
    .from("company_instagram_settings")
    .select(
      "enabled,instagram_business_account_id,instagram_username,oauth_mode,credential_source,token_expires_at,connection_status,connection_last_error,webhook_subscription_status,access_token_encrypted,access_token",
    )
    .eq("company_id", input.companyId)
    .maybeSingle();
  if (error) {
    throw new MetaInstagramLoginError(error.message, "IGL_STATUS_LOAD_FAILED", 500);
  }
  if (!data) {
    return {
      status: "not_connected",
      username: null,
      igUserId: null,
      oauthMode: null,
      tokenExpiresAt: null,
      webhookSubscriptionStatus: null,
      lastError: null,
      enabled: false,
      hasAccessToken: false,
      credentialSource: "manual",
    };
  }
  const hasAccessToken =
    Boolean(data.access_token_encrypted) || Boolean(String(data.access_token ?? "").trim());
  const nowMs = input.deps.nowMs?.() ?? Date.now();
  let status = (String(data.connection_status ?? "").trim() || null) as MetaConnectionStatus | null;
  if (!status || status === "not_connected") {
    status = data.enabled && hasAccessToken ? "connected" : "not_connected";
  }
  if (data.token_expires_at && new Date(String(data.token_expires_at)).getTime() < nowMs) {
    status = "connection_expired";
  }
  if (String(data.webhook_subscription_status ?? "") === "failed") {
    status = "webhook_subscription_failed";
  }
  const credentialSource: MetaCredentialSource =
    readCredentialSource(data.credential_source) === "oauth" ||
    String(data.oauth_mode ?? "") === "instagram_login"
      ? "oauth"
      : "manual";
  return {
    status,
    username: data.instagram_username ? String(data.instagram_username) : null,
    igUserId: data.instagram_business_account_id
      ? String(data.instagram_business_account_id)
      : null,
    oauthMode: data.oauth_mode ? String(data.oauth_mode) : null,
    tokenExpiresAt: data.token_expires_at ? String(data.token_expires_at) : null,
    webhookSubscriptionStatus: data.webhook_subscription_status
      ? String(data.webhook_subscription_status)
      : null,
    lastError: data.connection_last_error ? String(data.connection_last_error) : null,
    enabled: Boolean(data.enabled),
    hasAccessToken,
    credentialSource,
  };
}

/** Soft disconnect — manual credentials soft-disable only unless confirmClearCredentials. */
export async function softDisconnectMetaInstagramLogin(input: {
  companyId: string;
  confirmClearCredentials?: boolean;
  deps: MetaInstagramLoginDeps;
}): Promise<{
  ok: true;
  softDisconnected: true;
  metaRevoked: boolean;
  clearedCredentials: boolean;
  softDisableOnly: boolean;
}> {
  const existing = await loadExistingInstagramConnection(input.deps.client, input.companyId);
  let clearPlan: { clearSecrets: boolean; softDisableOnly: boolean };
  try {
    clearPlan = assertCanClearMetaCredentials({
      existing,
      confirmClearCredentials: Boolean(input.confirmClearCredentials),
      channel: "instagram",
    });
  } catch (error) {
    mapGuardError(error);
  }

  const { data: row } = await input.deps.client
    .from("company_instagram_settings")
    .select("instagram_business_account_id,api_version")
    .eq("company_id", input.companyId)
    .maybeSingle();

  let metaRevoked = false;
  const igUserId = String(row?.instagram_business_account_id ?? "").trim();
  if (igUserId && clearPlan.clearSecrets) {
    try {
      const { data: decrypted } = await input.deps.client.rpc(
        "get_company_instagram_settings_decrypted",
        { p_company_id: input.companyId },
      );
      const accessToken = String(
        (decrypted as { access_token?: string } | null)?.access_token ?? "",
      ).trim();
      if (accessToken) {
        const fetchImpl = input.deps.fetchImpl ?? fetch;
        const unsub = await unsubscribeInstagramMessagingWebhooks({
          igUserId,
          accessToken,
          graphApiVersion: String(row?.api_version ?? "v21.0"),
          fetchImpl,
        });
        metaRevoked = unsub.ok;
      }
    } catch {
      metaRevoked = false;
    }
  }

  const patch: Record<string, unknown> = {
    enabled: false,
    connection_status: "not_connected",
    connection_last_error: clearPlan.softDisableOnly
      ? "Disabled without clearing manual credentials"
      : "",
    updated_at: new Date().toISOString(),
  };
  if (clearPlan.clearSecrets) {
    Object.assign(patch, {
      access_token: "",
      access_token_encrypted: null,
      access_token_hint: "",
      app_secret_encrypted: null,
      app_secret_hint: "",
      webhook_verify_token: "",
      webhook_verify_token_encrypted: null,
      webhook_verify_token_hint: "",
      webhook_verify_token_lookup_hash: "",
      webhook_subscription_status: "",
      webhook_subscription_error: "",
      token_expires_at: null,
      credential_source: "manual",
    });
  }

  const { error } = await input.deps.client
    .from("company_instagram_settings")
    .update(patch)
    .eq("company_id", input.companyId);
  if (error) {
    throw new MetaInstagramLoginError(error.message, "IGL_DISCONNECT_FAILED", 500);
  }
  return {
    ok: true,
    softDisconnected: true,
    metaRevoked,
    clearedCredentials: clearPlan.clearSecrets,
    softDisableOnly: clearPlan.softDisableOnly,
  };
}

/**
 * Refresh a stored long-lived Instagram Login token (local reconnect/health path).
 * On failure, marks connection_expired / reauthorization_required without clearing secrets.
 */
export async function refreshStoredMetaInstagramLongLivedToken(input: {
  companyId: string;
  deps: MetaInstagramLoginDeps;
}): Promise<{
  ok: boolean;
  status: MetaConnectionStatus;
  tokenExpiresAt: string | null;
  message: string;
}> {
  assertEnabledAndAllowed(input.companyId);
  const { data: decrypted, error: decryptError } = await input.deps.client.rpc(
    "get_company_instagram_settings_decrypted",
    { p_company_id: input.companyId },
  );
  if (decryptError) {
    throw new MetaInstagramLoginError(decryptError.message, "IGL_REFRESH_LOAD_FAILED", 500);
  }
  const accessToken = String(
    (decrypted as { access_token?: string } | null)?.access_token ?? "",
  ).trim();
  if (!accessToken) {
    return {
      ok: false,
      status: "not_connected",
      tokenExpiresAt: null,
      message: "No Instagram access token to refresh",
    };
  }

  const fetchImpl = input.deps.fetchImpl ?? fetch;
  try {
    const refreshed = await refreshMetaInstagramLongLivedToken({ accessToken, fetchImpl });
    const tokenExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000).toISOString();
    const { error: upsertError } = await input.deps.client.rpc("upsert_company_instagram_settings", {
      p_company_id: input.companyId,
      p_enabled: true,
      p_provider: "meta_instagram",
      p_page_id: "",
      p_instagram_business_account_id: String(
        (decrypted as { instagram_business_account_id?: string } | null)
          ?.instagram_business_account_id ?? "",
      ),
      p_access_token: refreshed.accessToken,
      p_webhook_verify_token: "",
      p_api_version: String(
        (decrypted as { api_version?: string } | null)?.api_version ?? "v21.0",
      ),
      p_app_secret: "",
    });
    if (upsertError) {
      throw new MetaInstagramLoginError(upsertError.message, "IGL_REFRESH_PERSIST_FAILED", 500);
    }
    await input.deps.client
      .from("company_instagram_settings")
      .update({
        token_expires_at: tokenExpiresAt,
        connection_status: "connected",
        connection_last_error: "",
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", input.companyId);
    return {
      ok: true,
      status: "connected",
      tokenExpiresAt,
      message: "Instagram token refreshed",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Instagram token refresh failed";
    await input.deps.client
      .from("company_instagram_settings")
      .update({
        connection_status: "reauthorization_required",
        connection_last_error: message.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", input.companyId);
    return {
      ok: false,
      status: "reauthorization_required",
      tokenExpiresAt: null,
      message,
    };
  }
}

export const __metaInstagramLoginTest = {
  stripAuthCode,
  assertProfessionalAccount,
  META_INSTAGRAM_LOGIN_FLOW,
};
