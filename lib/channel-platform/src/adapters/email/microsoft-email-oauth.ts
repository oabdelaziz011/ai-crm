/**
 * Microsoft identity platform OAuth helpers for Microsoft 365 mailbox connect.
 * Tokens must only be handled server-side.
 */

import { EMAIL_PROVIDER_ERROR_CODES } from "./email-provider-contract.js";

export type MicrosoftEmailOAuthEnv = {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  redirectUri: string;
};

export type MicrosoftTokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number | null;
  scope: string | null;
  tokenType: string | null;
};

const DEFAULT_SCOPES = [
  "offline_access",
  "openid",
  "profile",
  "email",
  "https://graph.microsoft.com/Mail.Read",
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/User.Read",
].join(" ");

export function readMicrosoftEmailOAuthEnv(
  env: NodeJS.ProcessEnv = process.env,
): MicrosoftEmailOAuthEnv | null {
  const clientId = env.MICROSOFT_EMAIL_CLIENT_ID?.trim() || env.AZURE_AD_CLIENT_ID?.trim() || "";
  const clientSecret =
    env.MICROSOFT_EMAIL_CLIENT_SECRET?.trim() || env.AZURE_AD_CLIENT_SECRET?.trim() || "";
  const tenantId =
    env.MICROSOFT_EMAIL_TENANT_ID?.trim() || env.AZURE_AD_TENANT_ID?.trim() || "common";
  const redirectUri =
    env.MICROSOFT_EMAIL_REDIRECT_URI?.trim() ||
    env.AZURE_AD_REDIRECT_URI?.trim() ||
    "";
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, tenantId, redirectUri };
}

export function buildMicrosoftAuthorizeUrl(
  env: MicrosoftEmailOAuthEnv,
  input: { state: string; scopes?: string },
): string {
  const base = `https://login.microsoftonline.com/${encodeURIComponent(env.tenantId)}/oauth2/v2.0/authorize`;
  const params = new URLSearchParams({
    client_id: env.clientId,
    response_type: "code",
    redirect_uri: env.redirectUri,
    response_mode: "query",
    scope: input.scopes ?? DEFAULT_SCOPES,
    state: input.state,
    prompt: "select_account",
  });
  return `${base}?${params.toString()}`;
}

export async function exchangeMicrosoftAuthorizationCode(
  env: MicrosoftEmailOAuthEnv,
  input: { code: string; fetchImpl?: typeof fetch },
): Promise<MicrosoftTokenSet> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(env.tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: env.clientId,
    client_secret: env.clientSecret,
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: env.redirectUri,
    scope: DEFAULT_SCOPES,
  });
  const response = await fetchImpl(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    throw new Error(EMAIL_PROVIDER_ERROR_CODES.AUTH_INVALID);
  }
  const json = (await response.json()) as Record<string, unknown>;
  const accessToken = typeof json.access_token === "string" ? json.access_token : "";
  if (!accessToken) throw new Error(EMAIL_PROVIDER_ERROR_CODES.AUTH_INVALID);
  return {
    accessToken,
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : null,
    expiresIn: typeof json.expires_in === "number" ? json.expires_in : null,
    scope: typeof json.scope === "string" ? json.scope : null,
    tokenType: typeof json.token_type === "string" ? json.token_type : null,
  };
}

export async function refreshMicrosoftAccessToken(
  env: MicrosoftEmailOAuthEnv,
  input: { refreshToken: string; fetchImpl?: typeof fetch },
): Promise<MicrosoftTokenSet> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(env.tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: env.clientId,
    client_secret: env.clientSecret,
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
    scope: DEFAULT_SCOPES,
  });
  const response = await fetchImpl(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    throw new Error(EMAIL_PROVIDER_ERROR_CODES.OAUTH_EXPIRED);
  }
  const json = (await response.json()) as Record<string, unknown>;
  const accessToken = typeof json.access_token === "string" ? json.access_token : "";
  if (!accessToken) throw new Error(EMAIL_PROVIDER_ERROR_CODES.OAUTH_EXPIRED);
  return {
    accessToken,
    refreshToken:
      typeof json.refresh_token === "string" ? json.refresh_token : input.refreshToken,
    expiresIn: typeof json.expires_in === "number" ? json.expires_in : null,
    scope: typeof json.scope === "string" ? json.scope : null,
    tokenType: typeof json.token_type === "string" ? json.token_type : null,
  };
}

/** Opaque CSRF state — encode companyId + nonce; verified server-side only. */
export function encodeMicrosoftOAuthState(input: {
  companyId: string;
  userId: string;
  nonce: string;
}): string {
  const payload = JSON.stringify({
    c: input.companyId,
    u: input.userId,
    n: input.nonce,
    t: Date.now(),
  });
  return Buffer.from(payload, "utf8").toString("base64url");
}

export function decodeMicrosoftOAuthState(state: string): {
  companyId: string;
  userId: string;
  nonce: string;
  issuedAt: number;
} | null {
  try {
    const raw = Buffer.from(state, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const companyId = typeof parsed.c === "string" ? parsed.c : "";
    const userId = typeof parsed.u === "string" ? parsed.u : "";
    const nonce = typeof parsed.n === "string" ? parsed.n : "";
    const issuedAt = typeof parsed.t === "number" ? parsed.t : 0;
    if (!companyId || !userId || !nonce) return null;
    return { companyId, userId, nonce, issuedAt };
  } catch {
    return null;
  }
}
