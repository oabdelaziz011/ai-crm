import {
  isCompanyAllowedByMetaOauthAllowlistChain,
  isMetaOauthCompanyUuid,
  normalizeMetaOauthCompanyId,
  parseMetaOauthCompanyAllowlist,
} from "./meta-oauth-company-allowlist.js";

function envFlagTrue(name: string): boolean {
  const raw = String(process.env[name] ?? "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export const META_INSTAGRAM_LOGIN_ALLOWED_COMPANY_IDS_ENV =
  "META_INSTAGRAM_LOGIN_ALLOWED_COMPANY_IDS";

/** Instagram API with Instagram Login — required messaging scopes only. */
export const META_INSTAGRAM_LOGIN_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
] as const;

/**
 * @deprecated Prefer parseMetaOauthCompanyAllowlist — returns UUID set only (no `*` mode).
 */
export function parseAllowedCompanyIds(raw: unknown): ReadonlySet<string> {
  return parseMetaOauthCompanyAllowlist(raw).ids;
}

export function isMetaInstagramLoginEnabled(): boolean {
  if (envFlagTrue("META_INSTAGRAM_LOGIN_ENABLED")) return true;
  // Local convenience: inherit Pages OAuth master switch when dedicated flag unset.
  if (process.env.META_INSTAGRAM_LOGIN_ENABLED === undefined) {
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
export function isMetaInstagramLoginCompanyAllowed(
  companyId: unknown,
): boolean {
  if (!isMetaOauthCompanyUuid(companyId)) return false;
  return isCompanyAllowedByMetaOauthAllowlistChain(
    normalizeMetaOauthCompanyId(companyId),
    process.env[META_INSTAGRAM_LOGIN_ALLOWED_COMPANY_IDS_ENV],
    process.env.META_PAGES_OAUTH_ALLOWED_COMPANY_IDS,
  );
}

export type MetaInstagramLoginEnvConfig = {
  /** Instagram App ID (App Dashboard → Instagram → Business login settings). */
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
 * Env var *names* still required for Instagram Login OAuth (never values).
 * Primary names are listed; aliases are accepted by readMetaInstagramLoginEnvConfig.
 */
export function listMissingMetaInstagramLoginEnvKeys(): string[] {
  const missing: string[] = [];
  if (
    !envPresent(
      "META_INSTAGRAM_LOGIN_APP_ID",
      "META_PAGES_OAUTH_APP_ID",
      "META_EMBEDDED_SIGNUP_APP_ID",
    )
  ) {
    missing.push("META_INSTAGRAM_LOGIN_APP_ID");
  }
  if (
    !envPresent(
      "META_INSTAGRAM_LOGIN_APP_SECRET",
      "META_PAGES_OAUTH_APP_SECRET",
      "META_EMBEDDED_SIGNUP_APP_SECRET",
    )
  ) {
    missing.push("META_INSTAGRAM_LOGIN_APP_SECRET");
  }
  return missing;
}

export function readMetaInstagramLoginEnvConfig(
  publicApiBase: string,
): MetaInstagramLoginEnvConfig | null {
  const appId =
    String(process.env.META_INSTAGRAM_LOGIN_APP_ID ?? "").trim() ||
    String(process.env.META_PAGES_OAUTH_APP_ID ?? "").trim() ||
    String(process.env.META_EMBEDDED_SIGNUP_APP_ID ?? "").trim();
  const appSecret =
    String(process.env.META_INSTAGRAM_LOGIN_APP_SECRET ?? "").trim() ||
    String(process.env.META_PAGES_OAUTH_APP_SECRET ?? "").trim() ||
    String(process.env.META_EMBEDDED_SIGNUP_APP_SECRET ?? "").trim();
  if (!appId || !appSecret) return null;

  const graphApiVersion =
    String(process.env.META_INSTAGRAM_LOGIN_GRAPH_VERSION ?? "").trim() ||
    String(process.env.META_PAGES_OAUTH_GRAPH_VERSION ?? "").trim() ||
    String(process.env.META_EMBEDDED_SIGNUP_GRAPH_VERSION ?? "").trim() ||
    "v21.0";

  const redirectUri =
    String(process.env.META_INSTAGRAM_LOGIN_REDIRECT_URI ?? "").trim() ||
    `${publicApiBase.replace(/\/$/, "")}/api/oauth/instagram/callback`;

  if (!redirectUri) return null;
  return { appId, appSecret, graphApiVersion, redirectUri };
}
