import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isMetaMessengerOauthCompanyAllowed,
  isMetaMessengerOauthEnabled,
  listMissingMetaMessengerOauthEnvKeys,
  META_MESSENGER_LOGIN_SCOPES,
  readMetaMessengerOauthEnvConfig,
} from "./meta-messenger-oauth-flags.js";
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
  hasExistingMetaConnection,
  readCredentialSource,
  type ExistingMetaChannelConnection,
  type MetaCredentialSource,
} from "./meta-oauth-connection-guard.js";
import {
  clearMetaOauthPendingSession,
  putMetaOauthPendingSession,
  takeMetaOauthPendingSession,
  __clearMetaOauthPendingMemoryForTests,
} from "./meta-oauth-pending-store.js";
import type { MetaConnectionStatus } from "./meta-instagram-login-oauth.js";

export const META_MESSENGER_LOGIN_FLOW = "messenger_facebook_login";

export class MetaMessengerLoginError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = "MetaMessengerLoginError";
  }
}

export type MetaMessengerLoginDeps = {
  client: SupabaseClient;
  fetchImpl?: typeof fetch;
  nowMs?: () => number;
  stateSecret?: string;
};

type PageAsset = {
  pageId: string;
  name: string;
  pageAccessToken: string;
};

type MessengerPendingPayload = {
  pages: PageAsset[];
  /**
   * Long-lived Facebook user token used to re-resolve Page tokens at complete time.
   * Never returned to the browser. Cleared when the pending session is consumed.
   */
  longLivedUserToken: string;
  /** Soft expiry hint from long-lived user token exchange (seconds). Page tokens do not inherit this. */
  userTokenExpiresIn?: number | null;
};

function mapStateError(error: unknown): never {
  if (error instanceof MetaOauthStateError) {
    throw new MetaMessengerLoginError(error.message, error.code, error.statusCode);
  }
  throw error;
}

function mapGuardError(error: unknown): never {
  if (error && typeof error === "object" && "code" in error && "statusCode" in error) {
    const err = error as { message: string; code: string; statusCode: number };
    throw new MetaMessengerLoginError(err.message, err.code, err.statusCode);
  }
  throw error;
}

async function loadExistingMessengerConnection(
  client: SupabaseClient,
  companyId: string,
): Promise<ExistingMetaChannelConnection | null> {
  const { data, error } = await client
    .from("company_messenger_settings")
    .select("enabled,page_id,access_token_encrypted,access_token,credential_source")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    enabled: Boolean(data.enabled),
    pageOrAccountId: data.page_id ? String(data.page_id) : null,
    hasAccessToken:
      Boolean(data.access_token_encrypted) || Boolean(String(data.access_token ?? "").trim()),
    credentialSource: readCredentialSource(data.credential_source),
  };
}

function assertEnabledAndAllowed(companyId: string): void {
  if (!isMetaMessengerOauthEnabled()) {
    throw new MetaMessengerLoginError("Messenger OAuth is disabled.", "MSL_DISABLED", 403);
  }
  if (!isMetaMessengerOauthCompanyAllowed(companyId)) {
    throw new MetaMessengerLoginError(
      "Messenger OAuth is not available for this company.",
      "MSL_COMPANY_NOT_ALLOWED",
      403,
    );
  }
}

export function buildMetaMessengerLoginReadiness(companyId: string) {
  if (!isMetaMessengerOauthEnabled()) {
    return {
      ready: false,
      companyAllowed: false,
      reason: "MSL_DISABLED" as const,
      missingConfigKeys: [] as string[],
    };
  }
  const companyAllowed = isMetaMessengerOauthCompanyAllowed(companyId);
  if (!companyAllowed) {
    return {
      ready: false,
      companyAllowed: false,
      reason: "MSL_COMPANY_NOT_ALLOWED" as const,
      missingConfigKeys: [] as string[],
    };
  }
  const missingConfigKeys = listMissingMetaMessengerOauthEnvKeys();
  const meta = readMetaMessengerOauthEnvConfig(resolvePublicApiBaseUrl());
  if (!meta || missingConfigKeys.length > 0) {
    return {
      ready: false,
      companyAllowed: true,
      reason: "MSL_META_CONFIG_MISSING" as const,
      missingConfigKeys,
    };
  }
  return {
    ready: true,
    companyAllowed: true,
    reason: null,
    missingConfigKeys: [] as string[],
    redirectUri: meta.redirectUri,
    scopes: [...META_MESSENGER_LOGIN_SCOPES],
    graphApiVersion: sanitizeGraphVersion(meta.graphApiVersion),
  };
}

export function startMetaMessengerLogin(input: {
  companyId: string;
  userId: string | null;
  /** Required when an existing manual/OAuth connection must be replaced. */
  confirmReplaceExisting?: boolean;
  deps?: Pick<MetaMessengerLoginDeps, "nowMs" | "stateSecret">;
}): { authorizeUrl: string; state: string; redirectUri: string; scopes: readonly string[] } {
  assertEnabledAndAllowed(input.companyId);
  const meta = readMetaMessengerOauthEnvConfig(resolvePublicApiBaseUrl());
  if (!meta) {
    throw new MetaMessengerLoginError(
      "Messenger OAuth app credentials are missing.",
      "MSL_META_CONFIG_MISSING",
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
    flow: META_MESSENGER_LOGIN_FLOW,
    secret,
    nowMs: input.deps?.nowMs?.(),
    confirmReplaceExisting: Boolean(input.confirmReplaceExisting),
  });
  const version = sanitizeGraphVersion(meta.graphApiVersion);
  const url = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
  url.searchParams.set("client_id", meta.appId);
  url.searchParams.set("redirect_uri", meta.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", META_MESSENGER_LOGIN_SCOPES.join(","));
  return {
    authorizeUrl: url.toString(),
    state,
    redirectUri: meta.redirectUri,
    scopes: META_MESSENGER_LOGIN_SCOPES,
  };
}

async function exchangeCodeForUserToken(
  code: string,
  meta: NonNullable<ReturnType<typeof readMetaMessengerOauthEnvConfig>>,
  fetchImpl: typeof fetch,
): Promise<string> {
  const url = new URL(
    `https://graph.facebook.com/${sanitizeGraphVersion(meta.graphApiVersion)}/oauth/access_token`,
  );
  url.searchParams.set("client_id", meta.appId);
  url.searchParams.set("client_secret", meta.appSecret);
  url.searchParams.set("redirect_uri", meta.redirectUri);
  url.searchParams.set("code", code);
  const res = await fetchImpl(url.toString(), { headers: { Accept: "application/json" } });
  const json = (await res.json()) as { access_token?: string; error?: { message?: string } };
  if (!res.ok || !json.access_token) {
    throw new MetaMessengerLoginError(
      json.error?.message ?? "Failed to exchange Facebook OAuth code.",
      "MSL_CODE_EXCHANGE_FAILED",
      400,
    );
  }
  return json.access_token;
}

/** Exchange short-lived user token for a long-lived user token before listing Pages. */
async function exchangeForLongLivedUserToken(
  shortLivedToken: string,
  meta: NonNullable<ReturnType<typeof readMetaMessengerOauthEnvConfig>>,
  fetchImpl: typeof fetch,
): Promise<{ accessToken: string; expiresIn: number | null }> {
  const url = new URL(
    `https://graph.facebook.com/${sanitizeGraphVersion(meta.graphApiVersion)}/oauth/access_token`,
  );
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", meta.appId);
  url.searchParams.set("client_secret", meta.appSecret);
  url.searchParams.set("fb_exchange_token", shortLivedToken);
  const res = await fetchImpl(url.toString(), { headers: { Accept: "application/json" } });
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!res.ok || !json.access_token) {
    throw new MetaMessengerLoginError(
      json.error?.message ?? "Failed to exchange for a long-lived Facebook user token.",
      "MSL_LONG_LIVED_EXCHANGE_FAILED",
      400,
    );
  }
  const expiresIn =
    typeof json.expires_in === "number" && Number.isFinite(json.expires_in) && json.expires_in > 0
      ? Math.floor(json.expires_in)
      : null;
  return { accessToken: json.access_token, expiresIn };
}

async function listManagedPages(
  userToken: string,
  meta: NonNullable<ReturnType<typeof readMetaMessengerOauthEnvConfig>>,
  fetchImpl: typeof fetch,
): Promise<PageAsset[]> {
  const url = new URL(
    `https://graph.facebook.com/${sanitizeGraphVersion(meta.graphApiVersion)}/me/accounts`,
  );
  url.searchParams.set("fields", "id,name,access_token");
  url.searchParams.set("access_token", userToken);
  const res = await fetchImpl(url.toString(), { headers: { Accept: "application/json" } });
  const json = (await res.json()) as {
    data?: Array<{ id?: string; name?: string; access_token?: string }>;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new MetaMessengerLoginError(
      json.error?.message ?? "Failed to list Facebook Pages.",
      "MSL_PAGE_LIST_FAILED",
      400,
    );
  }
  return (json.data ?? [])
    .filter((row) => row.id && row.access_token)
    .map((row) => ({
      pageId: String(row.id),
      name: String(row.name ?? row.id),
      pageAccessToken: String(row.access_token),
    }));
}

const MESSENGER_SUBSCRIBED_FIELDS =
  "messages,messaging_postbacks,messaging_optins,message_deliveries,message_reads,messaging_referrals";

async function subscribePageMessagingWebhooks(input: {
  pageId: string;
  pageAccessToken: string;
  graphApiVersion: string;
  fetchImpl: typeof fetch;
}): Promise<{ ok: boolean; error: string | null }> {
  const version = sanitizeGraphVersion(input.graphApiVersion);
  const url = new URL(
    `https://graph.facebook.com/${version}/${encodeURIComponent(input.pageId)}/subscribed_apps`,
  );
  url.searchParams.set("subscribed_fields", MESSENGER_SUBSCRIBED_FIELDS);
  try {
    const res = await input.fetchImpl(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.pageAccessToken}`,
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
        error: json.error?.message ?? `Page subscribed_apps failed (HTTP ${res.status})`,
      };
    }
    return { ok: true, error: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Messenger webhook subscription failed",
    };
  }
}

/** Best-effort confirmation that `messages` is among subscribed_fields. */
async function confirmPageMessagingSubscription(input: {
  pageId: string;
  pageAccessToken: string;
  graphApiVersion: string;
  fetchImpl: typeof fetch;
}): Promise<{ ok: boolean; error: string | null }> {
  const version = sanitizeGraphVersion(input.graphApiVersion);
  const url = new URL(
    `https://graph.facebook.com/${version}/${encodeURIComponent(input.pageId)}/subscribed_apps`,
  );
  url.searchParams.set("access_token", input.pageAccessToken);
  try {
    const res = await input.fetchImpl(url.toString(), { headers: { Accept: "application/json" } });
    const json = (await res.json().catch(() => ({}))) as {
      data?: Array<{ subscribed_fields?: string[] }>;
      error?: { message?: string };
    };
    if (!res.ok) {
      return {
        ok: false,
        error: json.error?.message ?? `GET subscribed_apps failed (HTTP ${res.status})`,
      };
    }
    const hasMessages = (json.data ?? []).some(
      (row) => Array.isArray(row.subscribed_fields) && row.subscribed_fields.includes("messages"),
    );
    return hasMessages
      ? { ok: true, error: null }
      : { ok: false, error: "Page is not subscribed to messages field" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Messenger subscription confirm failed",
    };
  }
}

async function unsubscribePageMessagingWebhooks(input: {
  pageId: string;
  pageAccessToken: string;
  graphApiVersion: string;
  fetchImpl: typeof fetch;
}): Promise<{ ok: boolean }> {
  const version = sanitizeGraphVersion(input.graphApiVersion);
  const url = new URL(
    `https://graph.facebook.com/${version}/${encodeURIComponent(input.pageId)}/subscribed_apps`,
  );
  try {
    const res = await input.fetchImpl(url.toString(), {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${input.pageAccessToken}`,
        Accept: "application/json",
      },
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

export async function handleMetaMessengerLoginCallback(input: {
  code: string | null;
  state: string | null;
  error: string | null;
  errorReason: string | null;
  deps: MetaMessengerLoginDeps;
}): Promise<{ redirectUrl: string }> {
  const frontend = resolveLoginAppBaseUrl();
  const settingsPath = `${frontend}/dashboard/settings/messenger`;

  if (input.error) {
    return {
      redirectUrl: `${settingsPath}?messenger_oauth=error&reason=${encodeURIComponent(input.errorReason || input.error)}`,
    };
  }
  if (!input.code || !input.state) {
    return { redirectUrl: `${settingsPath}?messenger_oauth=error&reason=missing_code` };
  }

  const meta = readMetaMessengerOauthEnvConfig(resolvePublicApiBaseUrl());
  if (!meta) {
    return { redirectUrl: `${settingsPath}?messenger_oauth=error&reason=oauth_not_configured` };
  }

  const nowMs = input.deps.nowMs?.() ?? Date.now();
  let payload;
  try {
    const secret = resolveMetaOauthStateSecret(input.deps.stateSecret);
    payload = verifyMetaOauthState(input.state, secret, META_MESSENGER_LOGIN_FLOW, nowMs);
  } catch (error) {
    const reason =
      error instanceof MetaOauthStateError ? error.code : "META_OAUTH_STATE_INVALID";
    return {
      redirectUrl: `${settingsPath}?messenger_oauth=error&reason=${encodeURIComponent(reason)}`,
    };
  }

  try {
    assertEnabledAndAllowed(payload.companyId);
    const fetchImpl = input.deps.fetchImpl ?? fetch;
    const shortLived = await exchangeCodeForUserToken(input.code, meta, fetchImpl);
    const longLived = await exchangeForLongLivedUserToken(shortLived, meta, fetchImpl);
    const pages = await listManagedPages(longLived.accessToken, meta, fetchImpl);
    if (pages.length === 0) {
      return {
        redirectUrl: `${settingsPath}?messenger_oauth=error&reason=no_pages`,
      };
    }
    await putMetaOauthPendingSession({
      client: input.deps.client,
      state: input.state,
      companyId: payload.companyId,
      flow: META_MESSENGER_LOGIN_FLOW,
      payload: {
        pages,
        longLivedUserToken: longLived.accessToken,
        userTokenExpiresIn: longLived.expiresIn,
      } satisfies MessengerPendingPayload,
      nowMs,
    });
    const qs = new URLSearchParams({
      messenger_oauth: "select_page",
      state: input.state,
      page_count: String(pages.length),
    });
    return { redirectUrl: `${settingsPath}?${qs.toString()}` };
  } catch (error) {
    const code = error instanceof MetaMessengerLoginError ? error.code : "MSL_CALLBACK_FAILED";
    const message = error instanceof Error ? error.message : "Messenger OAuth callback failed";
    const qs = new URLSearchParams({
      messenger_oauth: "error",
      reason: code,
      message: message.slice(0, 180),
    });
    return { redirectUrl: `${settingsPath}?${qs.toString()}` };
  }
}

export async function listPendingMessengerPages(input: {
  companyId: string;
  state: string;
  deps?: Pick<MetaMessengerLoginDeps, "client" | "nowMs" | "stateSecret">;
}): Promise<{ pages: Array<{ pageId: string; name: string }> }> {
  assertEnabledAndAllowed(input.companyId);
  const nowMs = input.deps?.nowMs?.() ?? Date.now();
  try {
    const secret = resolveMetaOauthStateSecret(input.deps?.stateSecret);
    verifyMetaOauthState(input.state, secret, META_MESSENGER_LOGIN_FLOW, nowMs, input.companyId);
  } catch (error) {
    mapStateError(error);
  }
  let pending: MessengerPendingPayload | null = null;
  try {
    pending = await takeMetaOauthPendingSession<MessengerPendingPayload>({
      client: input.deps?.client ?? null,
      state: input.state,
      companyId: input.companyId,
      flow: META_MESSENGER_LOGIN_FLOW,
      nowMs,
      consume: false,
    });
  } catch (error) {
    mapGuardError(error);
  }
  if (!pending?.pages?.length) {
    throw new MetaMessengerLoginError(
      "Messenger page selection session expired. Reconnect.",
      "MSL_PENDING_EXPIRED",
      400,
    );
  }
  return {
    pages: pending.pages.map(({ pageId, name }) => ({ pageId, name })),
  };
}

export async function completeMetaMessengerLogin(input: {
  companyId: string;
  state: string;
  pageId: string;
  webhookVerifyToken?: string | null;
  /** Explicit reconnect confirmation — required when credentials already exist. */
  confirmReplaceExisting?: boolean;
  deps: MetaMessengerLoginDeps;
}): Promise<{
  ok: true;
  pageId: string;
  pageName: string;
  connected: boolean;
  connectionStatus: MetaConnectionStatus;
  message: string;
  webhookVerifyToken?: string;
}> {
  assertEnabledAndAllowed(input.companyId);
  const meta = readMetaMessengerOauthEnvConfig(resolvePublicApiBaseUrl());
  if (!meta) {
    throw new MetaMessengerLoginError(
      "Messenger OAuth app credentials are missing.",
      "MSL_META_CONFIG_MISSING",
      503,
    );
  }
  const nowMs = input.deps.nowMs?.() ?? Date.now();
  let statePayload;
  try {
    const secret = resolveMetaOauthStateSecret(input.deps.stateSecret);
    statePayload = verifyMetaOauthState(
      input.state,
      secret,
      META_MESSENGER_LOGIN_FLOW,
      nowMs,
      input.companyId,
    );
  } catch (error) {
    mapStateError(error);
  }

  const existing = await loadExistingMessengerConnection(input.deps.client, input.companyId);

  let pending: MessengerPendingPayload | null = null;
  try {
    pending = await takeMetaOauthPendingSession<MessengerPendingPayload>({
      client: input.deps.client,
      state: input.state,
      companyId: input.companyId,
      flow: META_MESSENGER_LOGIN_FLOW,
      nowMs,
      consume: true,
    });
  } catch (error) {
    mapGuardError(error);
  }
  if (!pending?.pages?.length) {
    throw new MetaMessengerLoginError(
      "Messenger page selection session expired. Reconnect.",
      "MSL_PENDING_EXPIRED",
      400,
    );
  }

  // Completing a valid OAuth pending session is explicit reconnect intent.
  // startMetaMessengerLogin already required confirmReplace when credentials existed.
  const confirmReplace =
    Boolean(input.confirmReplaceExisting) ||
    Boolean(statePayload.confirmReplaceExisting) ||
    Boolean(pending.longLivedUserToken);
  try {
    assertCanReplaceExistingMetaConnection({
      existing,
      confirmReplaceExisting: confirmReplace,
      channel: "messenger",
    });
  } catch (error) {
    mapGuardError(error);
  }

  const cached = pending.pages.find((p) => p.pageId === input.pageId);
  if (!cached) {
    throw new MetaMessengerLoginError(
      "Selected Facebook Page was not found for this authorization.",
      "MSL_PAGE_NOT_FOUND",
      400,
    );
  }

  const fetchImpl = input.deps.fetchImpl ?? fetch;
  // Always re-resolve the Page token at complete time so reconnect never keeps a stale
  // pending/expired token (root cause of "Session has expired" after selecting a Page).
  let selected: PageAsset = cached;
  const userToken = String(pending.longLivedUserToken ?? "").trim();
  if (userToken) {
    try {
      const freshPages = await listManagedPages(userToken, meta, fetchImpl);
      const fresh = freshPages.find((p) => p.pageId === input.pageId);
      if (fresh?.pageAccessToken) {
        selected = fresh;
      }
    } catch {
      // Fall back to the page token captured at callback time.
    }
  }
  if (!selected.pageAccessToken.trim()) {
    throw new MetaMessengerLoginError(
      "Could not resolve a fresh Page access token. Reconnect Messenger and select the Page again.",
      "MSL_PAGE_TOKEN_MISSING",
      400,
    );
  }

  // Preserve existing verify token on reconnect unless the UI explicitly sends a new one.
  const explicitVerify = String(input.webhookVerifyToken ?? "").trim();
  let verifyToken = explicitVerify;
  if (!verifyToken) {
    const { data: existingRow } = await input.deps.client
      .from("company_messenger_settings")
      .select("webhook_verify_token_encrypted")
      .eq("company_id", input.companyId)
      .maybeSingle();
    if (existingRow?.webhook_verify_token_encrypted) {
      // Empty string → whatsapp_is_unchanged_secret keeps the stored encrypted verify token.
      verifyToken = "";
    } else {
      verifyToken = `vo_ms_${randomBytes(12).toString("hex")}`;
    }
  }

  const { error } = await input.deps.client.rpc("upsert_company_messenger_settings", {
    p_company_id: input.companyId,
    p_enabled: true,
    p_provider: "meta_messenger",
    p_page_id: selected.pageId,
    p_access_token: selected.pageAccessToken,
    p_webhook_verify_token: verifyToken,
    p_api_version: sanitizeGraphVersion(meta.graphApiVersion),
    p_app_secret: meta.appSecret,
  });
  if (error) {
    throw new MetaMessengerLoginError(error.message, "MSL_PERSIST_FAILED", 500);
  }

  let subscribe = await subscribePageMessagingWebhooks({
    pageId: selected.pageId,
    pageAccessToken: selected.pageAccessToken,
    graphApiVersion: meta.graphApiVersion,
    fetchImpl,
  });
  if (subscribe.ok) {
    const confirmed = await confirmPageMessagingSubscription({
      pageId: selected.pageId,
      pageAccessToken: selected.pageAccessToken,
      graphApiVersion: meta.graphApiVersion,
      fetchImpl,
    });
    if (!confirmed.ok) {
      subscribe = { ok: false, error: confirmed.error };
    }
  }

  // Health probe — Connected requires Page token health.
  let healthOk = false;
  let healthError = "";
  try {
    const probe = new URL(
      `https://graph.facebook.com/${sanitizeGraphVersion(meta.graphApiVersion)}/${encodeURIComponent(selected.pageId)}`,
    );
    probe.searchParams.set("fields", "id,name");
    probe.searchParams.set("access_token", selected.pageAccessToken);
    const res = await fetchImpl(probe.toString());
    if (res.ok) {
      healthOk = true;
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      healthError = body.error?.message ?? `Page token health failed (HTTP ${res.status})`;
    }
  } catch (error) {
    healthOk = false;
    healthError = error instanceof Error ? error.message : "Page token health check failed";
  }

  if (!healthOk && /session has expired|error validating access token/i.test(healthError)) {
    throw new MetaMessengerLoginError(
      "Meta rejected the Page access token (session expired). Reconnect Messenger, select the Page, and confirm again so ValueOR can store a fresh token.",
      "MSL_PAGE_TOKEN_EXPIRED",
      400,
    );
  }

  const connectionStatus: MetaConnectionStatus = !subscribe.ok
    ? "webhook_subscription_failed"
    : healthOk
      ? "connected"
      : "reauthorization_required";

  // Page tokens from long-lived user tokens do not inherit the user-token expiry.
  // Never stamp token_expires_at from the user token — that falsely marks Connected as expired.
  await input.deps.client
    .from("company_messenger_settings")
    .update({
      page_name: selected.name,
      credential_source: "oauth",
      connection_status: connectionStatus,
      connection_last_error: subscribe.error ?? (healthOk ? "" : healthError || "Page token health check failed"),
      webhook_subscription_status: subscribe.ok ? "subscribed" : "failed",
      webhook_subscription_error: subscribe.error ?? "",
      token_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", input.companyId);

  await clearMetaOauthPendingSession({ client: input.deps.client, state: input.state });

  return {
    ok: true,
    pageId: selected.pageId,
    pageName: selected.name,
    connected: connectionStatus === "connected",
    connectionStatus,
    // One-time plaintext for Meta App Dashboard webhook verification.
    // Stored encrypted server-side; never returned again by status/connection reads.
    webhookVerifyToken: verifyToken || undefined,
    message:
      connectionStatus === "connected"
        ? "Messenger Page connected and webhook subscription succeeded. Copy the verify token into Meta App Dashboard if callback verification is still pending."
        : connectionStatus === "webhook_subscription_failed"
          ? "Page credentials saved, but webhook subscription failed. Paste the returned verify token into Meta App Dashboard callback settings and reconnect."
          : "Page credentials saved, but health check failed. Reauthorization may be required.",
  };
}

export async function getMetaMessengerLoginConnection(input: {
  companyId: string;
  deps: Pick<MetaMessengerLoginDeps, "client" | "nowMs">;
}): Promise<{
  status: MetaConnectionStatus;
  pageId: string | null;
  pageName: string | null;
  webhookSubscriptionStatus: string | null;
  lastError: string | null;
  enabled: boolean;
  hasAccessToken: boolean;
  credentialSource: MetaCredentialSource;
  tokenExpiresAt: string | null;
}> {
  assertEnabledAndAllowed(input.companyId);
  const { data, error } = await input.deps.client
    .from("company_messenger_settings")
    .select(
      "enabled,page_id,page_name,connection_status,connection_last_error,webhook_subscription_status,access_token_encrypted,access_token,credential_source,token_expires_at",
    )
    .eq("company_id", input.companyId)
    .maybeSingle();
  if (error) {
    throw new MetaMessengerLoginError(error.message, "MSL_STATUS_LOAD_FAILED", 500);
  }
  if (!data) {
    return {
      status: "not_connected",
      pageId: null,
      pageName: null,
      webhookSubscriptionStatus: null,
      lastError: null,
      enabled: false,
      hasAccessToken: false,
      credentialSource: "manual",
      tokenExpiresAt: null,
    };
  }
  const hasAccessToken =
    Boolean(data.access_token_encrypted) || Boolean(String(data.access_token ?? "").trim());
  const nowMs = input.deps.nowMs?.() ?? Date.now();
  let status = (String(data.connection_status ?? "").trim() || null) as MetaConnectionStatus | null;
  if (!status || status === "not_connected") {
    // Manual rows often keep default not_connected after migration 463 — infer from credentials.
    status = data.enabled && hasAccessToken ? "connected" : "not_connected";
  }
  // Page tokens from Messenger OAuth do not use user-token expiry. Only honor
  // token_expires_at for non-OAuth rows (legacy/manual) when explicitly set.
  const credentialSource = readCredentialSource(data.credential_source);
  if (
    credentialSource !== "oauth" &&
    data.token_expires_at &&
    new Date(String(data.token_expires_at)).getTime() < nowMs
  ) {
    status = "connection_expired";
  }
  if (String(data.webhook_subscription_status ?? "") === "failed") {
    status = "webhook_subscription_failed";
  }
  return {
    status,
    pageId: data.page_id ? String(data.page_id) : null,
    pageName: data.page_name ? String(data.page_name) : null,
    webhookSubscriptionStatus: data.webhook_subscription_status
      ? String(data.webhook_subscription_status)
      : null,
    lastError: data.connection_last_error ? String(data.connection_last_error) : null,
    enabled: Boolean(data.enabled),
    hasAccessToken,
    credentialSource,
    tokenExpiresAt: data.token_expires_at ? String(data.token_expires_at) : null,
  };
}

export async function softDisconnectMetaMessengerLogin(input: {
  companyId: string;
  /** Required to clear OAuth secrets; manual connections soft-disable without this. */
  confirmClearCredentials?: boolean;
  deps: MetaMessengerLoginDeps;
}): Promise<{
  ok: true;
  softDisconnected: true;
  metaRevoked: boolean;
  clearedCredentials: boolean;
  softDisableOnly: boolean;
}> {
  const existing = await loadExistingMessengerConnection(input.deps.client, input.companyId);
  let clearPlan: { clearSecrets: boolean; softDisableOnly: boolean };
  try {
    clearPlan = assertCanClearMetaCredentials({
      existing,
      confirmClearCredentials: Boolean(input.confirmClearCredentials),
      channel: "messenger",
    });
  } catch (error) {
    mapGuardError(error);
  }

  const { data: row } = await input.deps.client
    .from("company_messenger_settings")
    .select("page_id,api_version")
    .eq("company_id", input.companyId)
    .maybeSingle();

  let metaRevoked = false;
  const pageId = String(row?.page_id ?? "").trim();
  if (pageId && clearPlan.clearSecrets) {
    try {
      const { data: decrypted } = await input.deps.client.rpc(
        "get_company_messenger_settings_decrypted",
        { p_company_id: input.companyId },
      );
      const pageToken = String(
        (decrypted as { access_token?: string } | null)?.access_token ?? "",
      ).trim();
      if (pageToken) {
        const fetchImpl = input.deps.fetchImpl ?? fetch;
        const unsub = await unsubscribePageMessagingWebhooks({
          pageId,
          pageAccessToken: pageToken,
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
    .from("company_messenger_settings")
    .update(patch)
    .eq("company_id", input.companyId);
  if (error) {
    throw new MetaMessengerLoginError(error.message, "MSL_DISCONNECT_FAILED", 500);
  }
  return {
    ok: true,
    softDisconnected: true,
    metaRevoked,
    clearedCredentials: clearPlan.clearSecrets,
    softDisableOnly: clearPlan.softDisableOnly,
  };
}

export const __metaMessengerLoginTest = {
  putPending: putMetaOauthPendingSession,
  takePending: takeMetaOauthPendingSession,
  clearPending: clearMetaOauthPendingSession,
  clearMemory: __clearMetaOauthPendingMemoryForTests,
  exchangeForLongLivedUserToken,
  hasExistingMetaConnection,
  META_MESSENGER_LOGIN_FLOW,
};
