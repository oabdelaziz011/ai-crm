import {
  isCompanyAllowedByMetaOauthAllowlist,
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

/** Deny-by-default company allowlist for Meta Pages / Instagram Login OAuth. */
export const META_PAGES_OAUTH_ALLOWED_COMPANY_IDS_ENV =
  "META_PAGES_OAUTH_ALLOWED_COMPANY_IDS";

export const META_PAGES_OAUTH_REVIEWER_DEMO_COMPANY_ID =
  "d0000010-0001-4001-8001-000000000002";

export function parseMetaPagesOauthAllowedCompanyIds(
  raw: unknown = process.env[META_PAGES_OAUTH_ALLOWED_COMPANY_IDS_ENV],
): ReadonlySet<string> {
  return parseMetaOauthCompanyAllowlist(raw).ids;
}

export function isMetaPagesOauthCompanyAllowed(companyId: unknown): boolean {
  if (!isMetaOauthCompanyUuid(companyId)) return false;
  return isCompanyAllowedByMetaOauthAllowlist(
    normalizeMetaOauthCompanyId(companyId),
    process.env[META_PAGES_OAUTH_ALLOWED_COMPANY_IDS_ENV],
  );
}

/** Master switch. Default false — Local must opt in explicitly. */
export function isMetaPagesOauthEnabled(): boolean {
  return envFlagTrue("META_PAGES_OAUTH_ENABLED");
}

export type MetaPagesOauthEnvConfig = {
  appId: string;
  appSecret: string;
  graphApiVersion: string;
};

/**
 * Prefer dedicated Pages OAuth app credentials; fall back to Embedded Signup
 * Development app credentials already present in Local `.env.localstack`.
 */
export function readMetaPagesOauthEnvConfig(): MetaPagesOauthEnvConfig | null {
  const appId =
    String(process.env.META_PAGES_OAUTH_APP_ID ?? "").trim() ||
    String(process.env.META_EMBEDDED_SIGNUP_APP_ID ?? "").trim();
  const appSecret =
    String(process.env.META_PAGES_OAUTH_APP_SECRET ?? "").trim() ||
    String(process.env.META_EMBEDDED_SIGNUP_APP_SECRET ?? "").trim();
  if (!appId || !appSecret) return null;
  const graphApiVersion =
    String(process.env.META_PAGES_OAUTH_GRAPH_VERSION ?? "").trim() ||
    String(process.env.META_EMBEDDED_SIGNUP_GRAPH_VERSION ?? "").trim() ||
    "v21.0";
  return { appId, appSecret, graphApiVersion };
}

/** Scopes requested for Messenger Pages Login (App Review may be required for Advanced Access). */
export const META_MESSENGER_OAUTH_SCOPES = [
  "pages_show_list",
  "pages_messaging",
  "pages_manage_metadata",
  "pages_read_engagement",
] as const;

/** Scopes for Instagram Messaging via Page-linked Professional account. */
export const META_INSTAGRAM_OAUTH_SCOPES = [
  "pages_show_list",
  "pages_manage_metadata",
  "instagram_basic",
  "instagram_manage_messages",
] as const;
