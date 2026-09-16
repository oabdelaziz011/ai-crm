/**
 * Ensure Microsoft Graph access token is usable; refresh server-side when expired.
 * Never logs token values.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmailChannelConfiguration } from "./email-config.js";
import { EMAIL_PROVIDER_ERROR_CODES } from "./email-provider-contract.js";
import {
  readMicrosoftEmailOAuthEnv,
  refreshMicrosoftAccessToken,
} from "./microsoft-email-oauth.js";

export async function ensureFreshMicrosoftAccessToken(input: {
  config: EmailChannelConfiguration;
  companyId: string;
  client?: SupabaseClient;
  fetchImpl?: typeof fetch;
  nowMs?: number;
}): Promise<EmailChannelConfiguration> {
  const access = input.config.oauthAccessToken?.trim() || "";
  const refresh = input.config.oauthRefreshToken?.trim() || "";
  if (!access && !refresh) {
    throw new Error(EMAIL_PROVIDER_ERROR_CODES.OAUTH_EXPIRED);
  }

  const now = input.nowMs ?? Date.now();
  const expiresAt = input.config.oauthExpiresAt
    ? Date.parse(input.config.oauthExpiresAt)
    : Number.NaN;
  const stillValid =
    Boolean(access) && (!Number.isFinite(expiresAt) || expiresAt - now > 60_000);

  if (stillValid) {
    return input.config;
  }

  if (!refresh) {
    throw new Error(EMAIL_PROVIDER_ERROR_CODES.OAUTH_EXPIRED);
  }

  const env = readMicrosoftEmailOAuthEnv();
  if (!env) {
    throw new Error(EMAIL_PROVIDER_ERROR_CODES.OAUTH_NOT_CONFIGURED);
  }

  const tokens = await refreshMicrosoftAccessToken(env, {
    refreshToken: refresh,
    fetchImpl: input.fetchImpl,
  });

  if (input.client) {
    const expiresIso =
      tokens.expiresIn != null
        ? new Date(now + tokens.expiresIn * 1000).toISOString()
        : null;
    await input.client.rpc("store_company_email_oauth_tokens", {
      p_company_id: input.companyId,
      p_oauth_provider: "microsoft",
      p_access_token: tokens.accessToken,
      p_refresh_token: tokens.refreshToken,
      p_expires_at: expiresIso,
      p_mailbox_provider: "microsoft_365",
      p_from_email: input.config.fromEmail || null,
      p_from_name: input.config.fromName || null,
      p_connection_status: "connected",
    });
  }

  return {
    ...input.config,
    oauthAccessToken: tokens.accessToken,
    oauthRefreshToken: tokens.refreshToken ?? refresh,
    oauthExpiresAt:
      tokens.expiresIn != null
        ? new Date(now + tokens.expiresIn * 1000).toISOString()
        : input.config.oauthExpiresAt,
  };
}
