import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isMetaMessengerOauthCompanyAllowed,
  isMetaMessengerOauthEnabled,
  META_MESSENGER_LOGIN_SCOPES,
  readMetaMessengerOauthEnvConfig,
} from "./meta-messenger-oauth-flags.js";
import {
  createMetaOauthState,
  MetaOauthStateError,
  META_OAUTH_STATE_TTL_MS,
  resolveLoginAppBaseUrl,
  resolveMetaOauthStateSecret,
  resolvePublicApiBaseUrl,
  sanitizeGraphVersion,
  verifyMetaOauthState,
} from "./meta-oauth-state.js";
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

/** One-time post-callback cache: state → pages + user token until complete/expire. */
const pendingByState = new Map<
  string,
  { companyId: string; pages: PageAsset[]; exp: number }
>();

function cachePending(state: string, companyId: string, pages: PageAsset[], nowMs: number): void {
  pendingByState.set(state, { companyId, pages, exp: nowMs + META_OAUTH_STATE_TTL_MS });
}

function takePending(
  state: string,
  companyId: string,
  nowMs: number,
): PageAsset[] | null {
  const hit = pendingByState.get(state);
  if (!hit) return null;
  if (hit.exp < nowMs) {
    pendingByState.delete(state);
    return null;
  }
  if (hit.companyId.toLowerCase() !== companyId.toLowerCase()) {
    throw new MetaMessengerLoginError(
      "OAuth pending session company mismatch.",
      "MSL_PENDING_COMPANY_MISMATCH",
      403,
    );
  }
  return hit.pages;
}

function clearPending(state: string): void {
  pendingByState.delete(state);
}

function mapStateError(error: unknown): never {
  if (error instanceof MetaOauthStateError) {
    throw new MetaMessengerLoginError(error.message, error.code, error.statusCode);
  }
  throw error;
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
    return { ready: false, companyAllowed: false, reason: "MSL_DISABLED" as const };
  }
  const companyAllowed = isMetaMessengerOauthCompanyAllowed(companyId);
  if (!companyAllowed) {
    return { ready: false, companyAllowed: false, reason: "MSL_COMPANY_NOT_ALLOWED" as const };
  }
  const meta = readMetaMessengerOauthEnvConfig(resolvePublicApiBaseUrl());
  if (!meta) {
    return { ready: false, companyAllowed: true, reason: "MSL_META_CONFIG_MISSING" as const };
  }
  return {
    ready: true,
    companyAllowed: true,
    reason: null,
    redirectUri: meta.redirectUri,
    scopes: [...META_MESSENGER_LOGIN_SCOPES],
    graphApiVersion: sanitizeGraphVersion(meta.graphApiVersion),
  };
}

export function startMetaMessengerLogin(input: {
  companyId: string;
  userId: string | null;
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
  url.searchParams.set(
    "subscribed_fields",
    "messages,messaging_postbacks,messaging_optins,message_deliveries,message_reads,messaging_referrals",
  );
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
    const userToken = await exchangeCodeForUserToken(input.code, meta, fetchImpl);
    const pages = await listManagedPages(userToken, meta, fetchImpl);
    if (pages.length === 0) {
      return {
        redirectUrl: `${settingsPath}?messenger_oauth=error&reason=no_pages`,
      };
    }
    cachePending(input.state, payload.companyId, pages, nowMs);
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

export function listPendingMessengerPages(input: {
  companyId: string;
  state: string;
  deps?: Pick<MetaMessengerLoginDeps, "nowMs" | "stateSecret">;
}): { pages: Array<{ pageId: string; name: string }> } {
  assertEnabledAndAllowed(input.companyId);
  const nowMs = input.deps?.nowMs?.() ?? Date.now();
  try {
    const secret = resolveMetaOauthStateSecret(input.deps?.stateSecret);
    verifyMetaOauthState(input.state, secret, META_MESSENGER_LOGIN_FLOW, nowMs, input.companyId);
  } catch (error) {
    mapStateError(error);
  }
  const pages = takePending(input.state, input.companyId, nowMs);
  if (!pages) {
    throw new MetaMessengerLoginError(
      "Messenger page selection session expired. Reconnect.",
      "MSL_PENDING_EXPIRED",
      400,
    );
  }
  return {
    pages: pages.map(({ pageId, name }) => ({ pageId, name })),
  };
}

export async function completeMetaMessengerLogin(input: {
  companyId: string;
  state: string;
  pageId: string;
  webhookVerifyToken?: string | null;
  deps: MetaMessengerLoginDeps;
}): Promise<{
  ok: true;
  pageId: string;
  pageName: string;
  connected: boolean;
  connectionStatus: MetaConnectionStatus;
  message: string;
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
  try {
    const secret = resolveMetaOauthStateSecret(input.deps.stateSecret);
    verifyMetaOauthState(input.state, secret, META_MESSENGER_LOGIN_FLOW, nowMs, input.companyId);
  } catch (error) {
    mapStateError(error);
  }
  const pages = takePending(input.state, input.companyId, nowMs);
  if (!pages) {
    throw new MetaMessengerLoginError(
      "Messenger page selection session expired. Reconnect.",
      "MSL_PENDING_EXPIRED",
      400,
    );
  }
  const selected = pages.find((p) => p.pageId === input.pageId);
  if (!selected) {
    throw new MetaMessengerLoginError(
      "Selected Facebook Page was not found for this authorization.",
      "MSL_PAGE_NOT_FOUND",
      400,
    );
  }

  const verifyToken =
    String(input.webhookVerifyToken ?? "").trim() ||
    `vo_ms_${randomBytes(12).toString("hex")}`;

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

  const fetchImpl = input.deps.fetchImpl ?? fetch;
  const subscribe = await subscribePageMessagingWebhooks({
    pageId: selected.pageId,
    pageAccessToken: selected.pageAccessToken,
    graphApiVersion: meta.graphApiVersion,
    fetchImpl,
  });

  // Health probe
  let healthOk = false;
  try {
    const probe = new URL(
      `https://graph.facebook.com/${sanitizeGraphVersion(meta.graphApiVersion)}/${encodeURIComponent(selected.pageId)}`,
    );
    probe.searchParams.set("fields", "id,name");
    probe.searchParams.set("access_token", selected.pageAccessToken);
    const res = await fetchImpl(probe.toString());
    healthOk = res.ok;
  } catch {
    healthOk = false;
  }

  const connectionStatus: MetaConnectionStatus = !subscribe.ok
    ? "webhook_subscription_failed"
    : healthOk
      ? "connected"
      : "reauthorization_required";

  await input.deps.client
    .from("company_messenger_settings")
    .update({
      page_name: selected.name,
      connection_status: connectionStatus,
      connection_last_error: subscribe.error ?? (healthOk ? "" : "Page token health check failed"),
      webhook_subscription_status: subscribe.ok ? "subscribed" : "failed",
      webhook_subscription_error: subscribe.error ?? "",
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", input.companyId);

  clearPending(input.state);

  return {
    ok: true,
    pageId: selected.pageId,
    pageName: selected.name,
    connected: connectionStatus === "connected",
    connectionStatus,
    message:
      connectionStatus === "connected"
        ? "Messenger Page connected and webhook subscription succeeded."
        : connectionStatus === "webhook_subscription_failed"
          ? "Page credentials saved, but webhook subscription failed. Fix App Dashboard webhook config and reconnect."
          : "Page credentials saved, but health check failed. Reauthorization may be required.",
  };
}

export async function getMetaMessengerLoginConnection(input: {
  companyId: string;
  deps: Pick<MetaMessengerLoginDeps, "client">;
}): Promise<{
  status: MetaConnectionStatus;
  pageId: string | null;
  pageName: string | null;
  webhookSubscriptionStatus: string | null;
  lastError: string | null;
  enabled: boolean;
  hasAccessToken: boolean;
}> {
  assertEnabledAndAllowed(input.companyId);
  const { data, error } = await input.deps.client
    .from("company_messenger_settings")
    .select(
      "enabled,page_id,page_name,connection_status,connection_last_error,webhook_subscription_status,access_token_encrypted,access_token",
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
    };
  }
  const hasAccessToken = Boolean(data.access_token_encrypted) || Boolean(String(data.access_token ?? "").trim());
  let status = (String(data.connection_status ?? "").trim() || null) as MetaConnectionStatus | null;
  if (!status) {
    status = data.enabled && hasAccessToken ? "connected" : "not_connected";
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
  };
}

export async function softDisconnectMetaMessengerLogin(input: {
  companyId: string;
  deps: Pick<MetaMessengerLoginDeps, "client">;
}): Promise<{ ok: true; softDisconnected: true; metaRevoked: false }> {
  const { error } = await input.deps.client
    .from("company_messenger_settings")
    .update({
      enabled: false,
      access_token: "",
      access_token_encrypted: null,
      access_token_hint: "",
      app_secret_encrypted: null,
      app_secret_hint: "",
      webhook_verify_token: "",
      webhook_verify_token_encrypted: null,
      webhook_verify_token_hint: "",
      webhook_verify_token_lookup_hash: "",
      connection_status: "not_connected",
      connection_last_error: "",
      webhook_subscription_status: "",
      webhook_subscription_error: "",
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", input.companyId);
  if (error) {
    throw new MetaMessengerLoginError(error.message, "MSL_DISCONNECT_FAILED", 500);
  }
  return { ok: true, softDisconnected: true, metaRevoked: false };
}

export const __metaMessengerLoginTest = {
  cachePending,
  takePending,
  clearPending,
  META_MESSENGER_LOGIN_FLOW,
};
