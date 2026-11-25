import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isMetaPagesOauthCompanyAllowed,
  isMetaPagesOauthEnabled,
  META_INSTAGRAM_OAUTH_SCOPES,
  META_MESSENGER_OAUTH_SCOPES,
  readMetaPagesOauthEnvConfig,
} from "./meta-pages-oauth-flags.js";

const STATE_TTL_MS = 15 * 60 * 1000;

/** One-time Meta auth codes are exchanged once; cache user token by state for asset pick → complete. */
const userTokenByState = new Map<string, { token: string; exp: number }>();

function cacheUserToken(state: string, token: string, nowMs: number): void {
  userTokenByState.set(state, { token, exp: nowMs + STATE_TTL_MS });
}

function takeCachedUserToken(state: string, nowMs: number): string | null {
  const hit = userTokenByState.get(state);
  if (!hit) return null;
  if (hit.exp < nowMs) {
    userTokenByState.delete(state);
    return null;
  }
  return hit.token;
}

function clearCachedUserToken(state: string): void {
  userTokenByState.delete(state);
}

export type MetaPagesOauthChannel = "messenger" | "instagram";

export class MetaPagesOauthError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = "MetaPagesOauthError";
  }
}

type StatePayload = {
  companyId: string;
  userId: string | null;
  channel: MetaPagesOauthChannel;
  nonce: string;
  exp: number;
};

export type MetaPagesOauthSessionResult = {
  enabled: true;
  appId: string;
  state: string;
  graphApiVersion: string;
  channel: MetaPagesOauthChannel;
  scopes: readonly string[];
};

export type MetaPageAsset = {
  pageId: string;
  name: string;
  /** Present only server-side during complete; never returned to clients. */
  pageAccessToken?: string;
  instagramBusinessAccountId?: string | null;
  instagramUsername?: string | null;
};

export type MetaPagesOauthCompleteResult = {
  ok: true;
  channel: MetaPagesOauthChannel;
  pageId: string;
  instagramBusinessAccountId?: string | null;
  /** True only after credentials persisted AND outbound health probe succeeds. */
  connected: boolean;
  healthOk: boolean | null;
  message: string;
};

export type MetaPagesOauthDeps = {
  client: SupabaseClient;
  fetchImpl?: typeof fetch;
  nowMs?: () => number;
  stateSecret?: string;
};

function resolveStateSecret(explicit?: string): string {
  const fromEnv =
    String(process.env.META_PAGES_OAUTH_STATE_SECRET ?? "").trim() ||
    String(process.env.META_EMBEDDED_SIGNUP_STATE_SECRET ?? "").trim() ||
    String(process.env.META_EMBEDDED_SIGNUP_APP_SECRET ?? "").trim() ||
    String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const secret = (explicit ?? fromEnv).trim();
  if (!secret) {
    throw new MetaPagesOauthError(
      "Meta Pages OAuth state signing secret is not configured.",
      "MPO_STATE_SECRET_MISSING",
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
  expectedChannel: MetaPagesOauthChannel,
  nowMs: number,
): StatePayload {
  const parts = state.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new MetaPagesOauthError("Invalid Meta Pages OAuth state.", "MPO_STATE_INVALID", 400);
  }
  const [body, sig] = parts;
  const expectedSig = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new MetaPagesOauthError("Invalid Meta Pages OAuth state signature.", "MPO_STATE_INVALID", 400);
  }
  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
  } catch {
    throw new MetaPagesOauthError("Invalid Meta Pages OAuth state payload.", "MPO_STATE_INVALID", 400);
  }
  if (String(payload.companyId).toLowerCase() !== expectedCompanyId.toLowerCase()) {
    throw new MetaPagesOauthError("OAuth state company mismatch.", "MPO_STATE_COMPANY_MISMATCH", 403);
  }
  if (payload.channel !== expectedChannel) {
    throw new MetaPagesOauthError("OAuth state channel mismatch.", "MPO_STATE_CHANNEL_MISMATCH", 400);
  }
  if (!payload.exp || payload.exp < nowMs) {
    throw new MetaPagesOauthError("Meta Pages OAuth state expired.", "MPO_STATE_EXPIRED", 400);
  }
  return payload;
}

function scopesFor(channel: MetaPagesOauthChannel): readonly string[] {
  return channel === "instagram" ? META_INSTAGRAM_OAUTH_SCOPES : META_MESSENGER_OAUTH_SCOPES;
}

export function createMetaPagesOauthSession(input: {
  companyId: string;
  userId: string | null;
  channel: MetaPagesOauthChannel;
  deps?: Pick<MetaPagesOauthDeps, "nowMs" | "stateSecret">;
}): MetaPagesOauthSessionResult {
  if (!isMetaPagesOauthEnabled()) {
    throw new MetaPagesOauthError("Meta Pages OAuth is disabled.", "MPO_DISABLED", 403);
  }
  if (!isMetaPagesOauthCompanyAllowed(input.companyId)) {
    throw new MetaPagesOauthError(
      "Meta Pages OAuth is not available for this company.",
      "MPO_COMPANY_NOT_ALLOWED",
      403,
    );
  }
  const meta = readMetaPagesOauthEnvConfig();
  if (!meta) {
    throw new MetaPagesOauthError("Meta Pages OAuth app credentials are missing.", "MPO_META_CONFIG_MISSING", 503);
  }
  const nowMs = input.deps?.nowMs?.() ?? Date.now();
  const secret = resolveStateSecret(input.deps?.stateSecret);
  const state = signState(
    {
      companyId: input.companyId,
      userId: input.userId,
      channel: input.channel,
      nonce: randomBytes(16).toString("hex"),
      exp: nowMs + STATE_TTL_MS,
    },
    secret,
  );
  return {
    enabled: true,
    appId: meta.appId,
    state,
    graphApiVersion: meta.graphApiVersion,
    channel: input.channel,
    scopes: scopesFor(input.channel),
  };
}

async function exchangeCodeForUserToken(
  code: string,
  meta: NonNullable<ReturnType<typeof readMetaPagesOauthEnvConfig>>,
  fetchImpl: typeof fetch,
): Promise<string> {
  const url = new URL(`https://graph.facebook.com/${meta.graphApiVersion}/oauth/access_token`);
  url.searchParams.set("client_id", meta.appId);
  url.searchParams.set("client_secret", meta.appSecret);
  url.searchParams.set("code", code);
  const res = await fetchImpl(url.toString());
  const json = (await res.json()) as { access_token?: string; error?: { message?: string } };
  if (!res.ok || !json.access_token) {
    throw new MetaPagesOauthError(
      json.error?.message ?? "Failed to exchange Meta OAuth code.",
      "MPO_CODE_EXCHANGE_FAILED",
      400,
    );
  }
  return json.access_token;
}

/** Exchange short-lived user token for long-lived before listing Pages (never-expiring Page tokens). */
async function exchangeForLongLivedUserToken(
  shortLivedToken: string,
  meta: NonNullable<ReturnType<typeof readMetaPagesOauthEnvConfig>>,
  fetchImpl: typeof fetch,
): Promise<string> {
  const url = new URL(`https://graph.facebook.com/${meta.graphApiVersion}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", meta.appId);
  url.searchParams.set("client_secret", meta.appSecret);
  url.searchParams.set("fb_exchange_token", shortLivedToken);
  const res = await fetchImpl(url.toString());
  const json = (await res.json()) as { access_token?: string; error?: { message?: string } };
  if (!res.ok || !json.access_token) {
    throw new MetaPagesOauthError(
      json.error?.message ?? "Failed to exchange for a long-lived Facebook user token.",
      "MPO_LONG_LIVED_EXCHANGE_FAILED",
      400,
    );
  }
  return json.access_token;
}

async function resolveLongLivedUserToken(input: {
  code: string;
  state: string;
  meta: NonNullable<ReturnType<typeof readMetaPagesOauthEnvConfig>>;
  fetchImpl: typeof fetch;
  nowMs: number;
}): Promise<string> {
  let userToken = takeCachedUserToken(input.state, input.nowMs);
  if (userToken) return userToken;
  const shortLived = await exchangeCodeForUserToken(input.code, input.meta, input.fetchImpl);
  userToken = await exchangeForLongLivedUserToken(shortLived, input.meta, input.fetchImpl);
  cacheUserToken(input.state, userToken, input.nowMs);
  return userToken;
}

async function listPageAssets(
  userToken: string,
  meta: NonNullable<ReturnType<typeof readMetaPagesOauthEnvConfig>>,
  fetchImpl: typeof fetch,
  includeInstagram: boolean,
): Promise<MetaPageAsset[]> {
  const fields = includeInstagram
    ? "id,name,access_token,connected_instagram_account{id,username}"
    : "id,name,access_token";
  const url = new URL(`https://graph.facebook.com/${meta.graphApiVersion}/me/accounts`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", userToken);
  const res = await fetchImpl(url.toString());
  const json = (await res.json()) as {
    data?: Array<{
      id?: string;
      name?: string;
      access_token?: string;
      connected_instagram_account?: { id?: string; username?: string };
    }>;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new MetaPagesOauthError(
      json.error?.message ?? "Failed to list Facebook Pages.",
      "MPO_PAGE_LIST_FAILED",
      400,
    );
  }
  return (json.data ?? [])
    .filter((row) => row.id && row.access_token)
    .map((row) => ({
      pageId: String(row.id),
      name: String(row.name ?? row.id),
      pageAccessToken: String(row.access_token),
      instagramBusinessAccountId: row.connected_instagram_account?.id
        ? String(row.connected_instagram_account.id)
        : null,
      instagramUsername: row.connected_instagram_account?.username
        ? String(row.connected_instagram_account.username)
        : null,
    }));
}

/** Public asset list for picker UI — never includes page access tokens. */
export async function discoverMetaPageAssets(input: {
  companyId: string;
  channel: MetaPagesOauthChannel;
  code: string;
  state: string;
  deps: MetaPagesOauthDeps;
}): Promise<{ pages: Array<Omit<MetaPageAsset, "pageAccessToken">> }> {
  if (!isMetaPagesOauthEnabled()) {
    throw new MetaPagesOauthError("Meta Pages OAuth is disabled.", "MPO_DISABLED", 403);
  }
  if (!isMetaPagesOauthCompanyAllowed(input.companyId)) {
    throw new MetaPagesOauthError(
      "Meta Pages OAuth is not available for this company.",
      "MPO_COMPANY_NOT_ALLOWED",
      403,
    );
  }
  const meta = readMetaPagesOauthEnvConfig();
  if (!meta) {
    throw new MetaPagesOauthError("Meta Pages OAuth app credentials are missing.", "MPO_META_CONFIG_MISSING", 503);
  }
  const nowMs = input.deps.nowMs?.() ?? Date.now();
  const secret = resolveStateSecret(input.deps.stateSecret);
  verifyAndParseState(input.state, secret, input.companyId, input.channel, nowMs);
  const fetchImpl = input.deps.fetchImpl ?? fetch;
  const userToken = await resolveLongLivedUserToken({
    code: input.code,
    state: input.state,
    meta,
    fetchImpl,
    nowMs,
  });
  const pages = await listPageAssets(userToken, meta, fetchImpl, input.channel === "instagram");
  return {
    pages: pages.map(({ pageId, name, instagramBusinessAccountId, instagramUsername }) => ({
      pageId,
      name,
      instagramBusinessAccountId,
      instagramUsername,
    })),
  };
}

export async function completeMetaPagesOauth(input: {
  companyId: string;
  userId: string | null;
  channel: MetaPagesOauthChannel;
  code: string;
  state: string;
  pageId: string;
  instagramBusinessAccountId?: string | null;
  webhookVerifyToken?: string | null;
  deps: MetaPagesOauthDeps;
}): Promise<MetaPagesOauthCompleteResult> {
  if (!isMetaPagesOauthEnabled()) {
    throw new MetaPagesOauthError("Meta Pages OAuth is disabled.", "MPO_DISABLED", 403);
  }
  if (!isMetaPagesOauthCompanyAllowed(input.companyId)) {
    throw new MetaPagesOauthError(
      "Meta Pages OAuth is not available for this company.",
      "MPO_COMPANY_NOT_ALLOWED",
      403,
    );
  }
  const meta = readMetaPagesOauthEnvConfig();
  if (!meta) {
    throw new MetaPagesOauthError("Meta Pages OAuth app credentials are missing.", "MPO_META_CONFIG_MISSING", 503);
  }
  const pageId = String(input.pageId ?? "").trim();
  if (!pageId) {
    throw new MetaPagesOauthError("pageId is required.", "MPO_PAGE_REQUIRED", 400);
  }

  const nowMs = input.deps.nowMs?.() ?? Date.now();
  const secret = resolveStateSecret(input.deps.stateSecret);
  verifyAndParseState(input.state, secret, input.companyId, input.channel, nowMs);
  const fetchImpl = input.deps.fetchImpl ?? fetch;
  const userToken = await resolveLongLivedUserToken({
    code: input.code,
    state: input.state,
    meta,
    fetchImpl,
    nowMs,
  });
  const pages = await listPageAssets(userToken, meta, fetchImpl, input.channel === "instagram");
  const selected = pages.find((page) => page.pageId === pageId);
  if (!selected?.pageAccessToken) {
    throw new MetaPagesOauthError(
      "Selected Facebook Page was not found for this authorization.",
      "MPO_PAGE_NOT_FOUND",
      400,
    );
  }

  const verifyToken =
    String(input.webhookVerifyToken ?? "").trim() ||
    `vo_${input.channel}_${randomBytes(12).toString("hex")}`;

  if (input.channel === "messenger") {
    const { error } = await input.deps.client.rpc("upsert_company_messenger_settings", {
      p_company_id: input.companyId,
      p_enabled: true,
      p_provider: "meta_messenger",
      p_page_id: selected.pageId,
      p_access_token: selected.pageAccessToken,
      p_webhook_verify_token: verifyToken,
      p_api_version: meta.graphApiVersion,
      p_app_secret: meta.appSecret,
    });
    if (error) {
      throw new MetaPagesOauthError(error.message, "MPO_PERSIST_FAILED", 500);
    }
    const healthOk = await probePageTokenHealth(
      fetchImpl,
      meta,
      selected.pageId,
      selected.pageAccessToken,
    );
    clearCachedUserToken(input.state);
    return {
      ok: true,
      channel: "messenger",
      pageId: selected.pageId,
      connected: healthOk === true,
      healthOk,
      message: healthOk
        ? "Messenger credentials saved and Page token health check passed. Confirm webhook subscription in Meta Dashboard before production traffic."
        : "Messenger credentials saved, but health check did not pass. Fix permissions/webhook before treating as Connected.",
    };
  }

  const igBaId =
    String(input.instagramBusinessAccountId ?? "").trim() ||
    selected.instagramBusinessAccountId ||
    "";
  if (!igBaId) {
    throw new MetaPagesOauthError(
      "Selected Page has no linked Instagram Professional account.",
      "MPO_IG_ACCOUNT_MISSING",
      400,
    );
  }
  const { error } = await input.deps.client.rpc("upsert_company_instagram_settings", {
    p_company_id: input.companyId,
    p_enabled: true,
    p_provider: "meta_instagram",
    p_page_id: selected.pageId,
    p_instagram_business_account_id: igBaId,
    p_access_token: selected.pageAccessToken,
    p_webhook_verify_token: verifyToken,
    p_api_version: meta.graphApiVersion,
    p_app_secret: meta.appSecret,
  });
  if (error) {
    throw new MetaPagesOauthError(error.message, "MPO_PERSIST_FAILED", 500);
  }
  const healthOk = await probeInstagramHealth(fetchImpl, meta, igBaId, selected.pageAccessToken);
  clearCachedUserToken(input.state);
  return {
    ok: true,
    channel: "instagram",
    pageId: selected.pageId,
    instagramBusinessAccountId: igBaId,
    connected: healthOk === true,
    healthOk,
    message: healthOk
      ? "Instagram credentials saved and account health check passed. Confirm webhook subscription in Meta Dashboard before production traffic."
      : "Instagram credentials saved, but health check did not pass. Fix permissions/webhook before treating as Connected.",
  };
}

async function probePageTokenHealth(
  fetchImpl: typeof fetch,
  meta: NonNullable<ReturnType<typeof readMetaPagesOauthEnvConfig>>,
  pageId: string,
  pageAccessToken: string,
): Promise<boolean | null> {
  try {
    const url = new URL(`https://graph.facebook.com/${meta.graphApiVersion}/${pageId}`);
    url.searchParams.set("fields", "id,name");
    url.searchParams.set("access_token", pageAccessToken);
    const res = await fetchImpl(url.toString());
    return res.ok;
  } catch {
    return null;
  }
}

async function probeInstagramHealth(
  fetchImpl: typeof fetch,
  meta: NonNullable<ReturnType<typeof readMetaPagesOauthEnvConfig>>,
  igBaId: string,
  pageAccessToken: string,
): Promise<boolean | null> {
  try {
    const url = new URL(`https://graph.instagram.com/${meta.graphApiVersion}/${igBaId}`);
    url.searchParams.set("fields", "id,username");
    url.searchParams.set("access_token", pageAccessToken);
    const res = await fetchImpl(url.toString());
    if (!res.ok) {
      // Fallback: Facebook Graph host for Page-linked tokens
      const fb = new URL(`https://graph.facebook.com/${meta.graphApiVersion}/${igBaId}`);
      fb.searchParams.set("fields", "id,username");
      fb.searchParams.set("access_token", pageAccessToken);
      const fbRes = await fetchImpl(fb.toString());
      return fbRes.ok;
    }
    return true;
  } catch {
    return null;
  }
}

/** Soft disconnect: disable + clear secrets. Does not call Meta revoke/unsubscribe. */
export async function softDisconnectMetaChannel(input: {
  companyId: string;
  channel: MetaPagesOauthChannel;
  deps: Pick<MetaPagesOauthDeps, "client">;
}): Promise<{ ok: true; softDisconnected: true; metaRevoked: false }> {
  const softClear = {
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
    updated_at: new Date().toISOString(),
  };
  if (input.channel === "messenger") {
    const { error } = await input.deps.client
      .from("company_messenger_settings")
      .update(softClear)
      .eq("company_id", input.companyId);
    if (error) {
      throw new MetaPagesOauthError(error.message, "MPO_DISCONNECT_FAILED", 500);
    }
  } else {
    const { error } = await input.deps.client
      .from("company_instagram_settings")
      .update(softClear)
      .eq("company_id", input.companyId);
    if (error) {
      throw new MetaPagesOauthError(error.message, "MPO_DISCONNECT_FAILED", 500);
    }
  }
  return { ok: true, softDisconnected: true, metaRevoked: false };
}

export function buildMetaPagesOauthReadiness(companyId: string) {
  if (!isMetaPagesOauthEnabled()) {
    return { ready: false, companyAllowed: false, reason: "MPO_DISABLED" as const };
  }
  const companyAllowed = isMetaPagesOauthCompanyAllowed(companyId);
  if (!companyAllowed) {
    return { ready: false, companyAllowed: false, reason: "MPO_COMPANY_NOT_ALLOWED" as const };
  }
  if (!readMetaPagesOauthEnvConfig()) {
    return { ready: false, companyAllowed: true, reason: "MPO_META_CONFIG_MISSING" as const };
  }
  return { ready: true, companyAllowed: true, reason: null };
}

/** Test helpers */
export const __metaPagesOauthTest = { signState, verifyAndParseState, resolveStateSecret };
