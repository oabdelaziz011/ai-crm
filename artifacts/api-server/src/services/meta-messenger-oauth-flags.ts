import {
  isCompanyAllowedByMetaOauthAllowlistChain,
  isMetaOauthCompanyUuid,
  normalizeMetaOauthCompanyId,
  parseMetaOauthCompanyAllowlist,
} from "./meta-oauth-company-allowlist.js";
import {
  isInstagramLoginOnlyAppId,
  isMetaNumericAppId,
} from "./meta-oauth-state.js";

function envFlagTrue(name: string): boolean {
  const raw = String(process.env[name] ?? "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export const META_MESSENGER_OAUTH_ALLOWED_COMPANY_IDS_ENV =
  "META_MESSENGER_OAUTH_ALLOWED_COMPANY_IDS";

/** Facebook Login for Business — Messenger Page connection scopes. */
export const META_MESSENGER_LOGIN_SCOPES = [
  "pages_show_list",
  "pages_messaging",
  "pages_manage_metadata",
  "pages_read_engagement",
] as const;

/**
 * @deprecated Prefer parseMetaOauthCompanyAllowlist — returns UUID set only (no `*` mode).
 * Kept for callers that only need explicit UUID membership.
 */
export function parseAllowedCompanyIds(raw: unknown): ReadonlySet<string> {
  return parseMetaOauthCompanyAllowlist(raw).ids;
}

export function isMetaMessengerOauthEnabled(): boolean {
  if (envFlagTrue("META_MESSENGER_OAUTH_ENABLED")) return true;
  if (process.env.META_MESSENGER_OAUTH_ENABLED === undefined) {
    return envFlagTrue("META_PAGES_OAUTH_ENABLED");
  }
  return false;
}

/**
 * OAuth company allowlist gate only.
 * Empty/missing dedicated + empty/missing Pages fallback → deny all.
 * Dedicated or Pages value `*` → admit any valid company UUID (still requires enablement,
 * auth, company scope, and commercial entitlement at the route layer).
 */
export function isMetaMessengerOauthCompanyAllowed(
  companyId: unknown,
): boolean {
  if (!isMetaOauthCompanyUuid(companyId)) return false;
  return isCompanyAllowedByMetaOauthAllowlistChain(
    normalizeMetaOauthCompanyId(companyId),
    process.env[META_MESSENGER_OAUTH_ALLOWED_COMPANY_IDS_ENV],
    process.env.META_PAGES_OAUTH_ALLOWED_COMPANY_IDS,
  );
}

export type MetaMessengerOauthEnvConfig = {
  appId: string;
  appSecret: string;
  graphApiVersion: string;
  redirectUri: string;
};

function envPresent(...names: string[]): boolean {
  return names.some(
    (name) => String(process.env[name] ?? "").trim().length > 0,
  );
}

/**
 * Env var *names* still required for Messenger OAuth (never values).
 * Primary names are listed; aliases are accepted by readMetaMessengerOauthEnvConfig.
 */
export function listMissingMetaMessengerOauthEnvKeys(): string[] {
  const missing: string[] = [];
  if (
    !envPresent(
      "META_MESSENGER_OAUTH_APP_ID",
      "META_PAGES_OAUTH_APP_ID",
      "META_EMBEDDED_SIGNUP_APP_ID",
    )
  ) {
    missing.push("META_MESSENGER_OAUTH_APP_ID");
  }
  if (
    !envPresent(
      "META_MESSENGER_OAUTH_APP_SECRET",
      "META_PAGES_OAUTH_APP_SECRET",
      "META_EMBEDDED_SIGNUP_APP_SECRET",
    )
  ) {
    missing.push("META_MESSENGER_OAUTH_APP_SECRET");
  }
  return missing;
}

export function readMetaMessengerOauthEnvConfig(
  publicApiBase: string,
): MetaMessengerOauthEnvConfig | null {
  const appId =
    String(process.env.META_MESSENGER_OAUTH_APP_ID ?? "").trim() ||
    String(process.env.META_PAGES_OAUTH_APP_ID ?? "").trim() ||
    String(process.env.META_EMBEDDED_SIGNUP_APP_ID ?? "").trim();
  const appSecret =
    String(process.env.META_MESSENGER_OAUTH_APP_SECRET ?? "").trim() ||
    String(process.env.META_PAGES_OAUTH_APP_SECRET ?? "").trim() ||
    String(process.env.META_EMBEDDED_SIGNUP_APP_SECRET ?? "").trim();
  // Refuse Instagram Login App ID — facebook.com OAuth returns PLATFORM__INVALID_APP_ID.
  if (!appId || !appSecret || !isMetaNumericAppId(appId) || isInstagramLoginOnlyAppId(appId)) {
    return null;
  }

  const graphApiVersion =
    String(process.env.META_MESSENGER_OAUTH_GRAPH_VERSION ?? "").trim() ||
    String(process.env.META_PAGES_OAUTH_GRAPH_VERSION ?? "").trim() ||
    String(process.env.META_EMBEDDED_SIGNUP_GRAPH_VERSION ?? "").trim() ||
    "v21.0";

  const redirectUri =
    String(process.env.META_MESSENGER_OAUTH_REDIRECT_URI ?? "").trim() ||
    `${publicApiBase.replace(/\/$/, "")}/api/oauth/messenger/callback`;

  if (!redirectUri) return null;
  return { appId, appSecret, graphApiVersion, redirectUri };
}
