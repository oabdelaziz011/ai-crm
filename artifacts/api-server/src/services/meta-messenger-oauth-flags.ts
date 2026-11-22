function envFlagTrue(name: string): boolean {
  const raw = String(process.env[name] ?? "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

const COMPANY_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeCompanyId(companyId: unknown): string {
  return String(companyId ?? "")
    .trim()
    .toLowerCase();
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

export function parseAllowedCompanyIds(raw: unknown): ReadonlySet<string> {
  const text = String(raw ?? "").trim();
  if (!text) return new Set();
  const out = new Set<string>();
  for (const part of text.split(/[,;\s]+/)) {
    const id = normalizeCompanyId(part);
    if (COMPANY_UUID_RE.test(id)) out.add(id);
  }
  return out;
}

export function isMetaMessengerOauthEnabled(): boolean {
  if (envFlagTrue("META_MESSENGER_OAUTH_ENABLED")) return true;
  if (process.env.META_MESSENGER_OAUTH_ENABLED === undefined) {
    return envFlagTrue("META_PAGES_OAUTH_ENABLED");
  }
  return false;
}

export function isMetaMessengerOauthCompanyAllowed(companyId: unknown): boolean {
  const id = normalizeCompanyId(companyId);
  if (!COMPANY_UUID_RE.test(id)) return false;
  const dedicated = parseAllowedCompanyIds(process.env[META_MESSENGER_OAUTH_ALLOWED_COMPANY_IDS_ENV]);
  if (dedicated.size > 0) return dedicated.has(id);
  const fallback = parseAllowedCompanyIds(process.env.META_PAGES_OAUTH_ALLOWED_COMPANY_IDS);
  if (fallback.size === 0) return false;
  return fallback.has(id);
}

export type MetaMessengerOauthEnvConfig = {
  appId: string;
  appSecret: string;
  graphApiVersion: string;
  redirectUri: string;
};

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
  if (!appId || !appSecret) return null;

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
