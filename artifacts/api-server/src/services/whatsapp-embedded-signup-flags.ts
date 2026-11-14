function envFlagTrue(name: string): boolean {
  const raw = String(process.env[name] ?? "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/**
 * Env var: comma/whitespace-separated company UUIDs allowed to use Embedded Signup.
 * Missing/empty list → deny all (no global enable via master flag alone).
 */
export const WHATSAPP_EMBEDDED_SIGNUP_ALLOWED_COMPANY_IDS_ENV =
  "WHATSAPP_EMBEDDED_SIGNUP_ALLOWED_COMPANY_IDS";

/**
 * Meta App Review DEMO Beta tenant. Documented allowlist seed only — never auto-allowed.
 * Production must set WHATSAPP_EMBEDDED_SIGNUP_ALLOWED_COMPANY_IDS explicitly.
 */
export const WHATSAPP_EMBEDDED_SIGNUP_REVIEWER_DEMO_COMPANY_ID =
  "d0000010-0001-4001-8001-000000000002";

const COMPANY_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeCompanyId(companyId: unknown): string {
  return String(companyId ?? "")
    .trim()
    .toLowerCase();
}

export function isWhatsAppEmbeddedSignupCompanyIdShape(companyId: unknown): boolean {
  return COMPANY_UUID_RE.test(normalizeCompanyId(companyId));
}

/**
 * Parse the Embedded Signup company allowlist from env.
 * Malformed tokens are dropped. Empty/missing → empty set (deny-by-default).
 */
export function parseWhatsAppEmbeddedSignupAllowedCompanyIds(
  raw: unknown = process.env[WHATSAPP_EMBEDDED_SIGNUP_ALLOWED_COMPANY_IDS_ENV],
): ReadonlySet<string> {
  const text = String(raw ?? "").trim();
  if (!text) return new Set();
  const out = new Set<string>();
  for (const part of text.split(/[,;\s]+/)) {
    const id = normalizeCompanyId(part);
    if (COMPANY_UUID_RE.test(id)) out.add(id);
  }
  return out;
}

/**
 * Server-side tenant gate for Embedded Signup.
 * Deny when company id is missing/invalid or not on the explicit allowlist.
 * An empty allowlist denies every company (including super-admins).
 */
export function isWhatsAppEmbeddedSignupCompanyAllowed(companyId: unknown): boolean {
  const id = normalizeCompanyId(companyId);
  if (!COMPANY_UUID_RE.test(id)) return false;
  const allowed = parseWhatsAppEmbeddedSignupAllowedCompanyIds();
  if (allowed.size === 0) return false;
  return allowed.has(id);
}

/** Master switch for Embedded Signup API + UI (server enforces). Default: false. */
export function isWhatsAppEmbeddedSignupEnabled(): boolean {
  return envFlagTrue("WHATSAPP_EMBEDDED_SIGNUP_ENABLED");
}

/** Coexistence featureType plumbing only. Default: false. Never force for all tenants. */
export function isWhatsAppCoexistenceEnabled(): boolean {
  return envFlagTrue("WHATSAPP_COEXISTENCE_ENABLED");
}

/**
 * Auto WABA → webhook subscribe. Default: false.
 * When false: zero Graph subscription calls.
 */
export function isWhatsAppEmbeddedSignupAutoSubscribeEnabled(): boolean {
  return envFlagTrue("WHATSAPP_EMBEDDED_SIGNUP_AUTO_SUBSCRIBE");
}

/** True when NODE_ENV is production (hard production guard for subscribe Graph calls). */
export function isWhatsAppEmbeddedSignupProductionRuntime(): boolean {
  return String(process.env.NODE_ENV ?? "")
    .trim()
    .toLowerCase() === "production";
}

/**
 * Explicit opt-in for subscribe Graph calls in production. Default: false.
 * Even if AUTO_SUBSCRIBE=true, production refuses unless this is true.
 */
export function isWhatsAppEmbeddedSignupAllowProductionSubscribe(): boolean {
  return envFlagTrue("WHATSAPP_EMBEDDED_SIGNUP_ALLOW_PRODUCTION_SUBSCRIBE");
}

export type WhatsAppEmbeddedSignupOnboardingMode = "cloud_api_new" | "coexistence";

/** App credentials required for code exchange. Path-specific config IDs are resolved separately. */
export type MetaEmbeddedSignupEnvConfig = {
  appId: string;
  appSecret: string;
  graphApiVersion: string;
};

export const META_EMBEDDED_SIGNUP_CLOUD_API_CONFIG_ID_ENV =
  "META_EMBEDDED_SIGNUP_CLOUD_API_CONFIG_ID";
export const META_EMBEDDED_SIGNUP_COEXISTENCE_CONFIG_ID_ENV =
  "META_EMBEDDED_SIGNUP_COEXISTENCE_CONFIG_ID";

export function readMetaEmbeddedSignupEnvConfig(): MetaEmbeddedSignupEnvConfig | null {
  const appId = String(process.env.META_EMBEDDED_SIGNUP_APP_ID ?? "").trim();
  const appSecret = String(process.env.META_EMBEDDED_SIGNUP_APP_SECRET ?? "").trim();
  const graphApiVersion =
    String(process.env.META_EMBEDDED_SIGNUP_GRAPH_VERSION ?? "").trim() || "v21.0";

  if (!appId || !appSecret) {
    return null;
  }

  return { appId, appSecret, graphApiVersion };
}

/**
 * Resolve the Meta Login for Business configuration ID for one onboarding path.
 * Never falls back to the other path's ID. Returns null when the required env is unset.
 */
export function readMetaEmbeddedSignupConfigIdForMode(
  mode: WhatsAppEmbeddedSignupOnboardingMode,
): string | null {
  const envName =
    mode === "coexistence"
      ? META_EMBEDDED_SIGNUP_COEXISTENCE_CONFIG_ID_ENV
      : META_EMBEDDED_SIGNUP_CLOUD_API_CONFIG_ID_ENV;
  const configId = String(process.env[envName] ?? "").trim();
  return configId || null;
}
