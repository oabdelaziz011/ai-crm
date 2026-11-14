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

/** Meta Embedded Signup protocol version implemented by ValueOR launch extras. */
export const WHATSAPP_EMBEDDED_SIGNUP_PROTOCOL_VERSION = "v4" as const;

export const META_EMBEDDED_SIGNUP_CLOUD_API_CONFIG_ID_ENV =
  "META_EMBEDDED_SIGNUP_CLOUD_API_CONFIG_ID";
export const META_EMBEDDED_SIGNUP_COEXISTENCE_CONFIG_ID_ENV =
  "META_EMBEDDED_SIGNUP_COEXISTENCE_CONFIG_ID";

/** Optional 6-digit PIN used only when WHATSAPP_EMBEDDED_SIGNUP_REGISTER_PHONE=true. */
export const WHATSAPP_EMBEDDED_SIGNUP_REGISTRATION_PIN_ENV =
  "WHATSAPP_EMBEDDED_SIGNUP_REGISTRATION_PIN";

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

/**
 * Coexistence featureType plumbing only. Default: false.
 * Phase 1 keeps Coexistence closed until a dedicated CONFIG_ID and history/smb ingest ship.
 */
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

/** Optional Cloud API /register after Embedded Signup. Default: false. */
export function isWhatsAppEmbeddedSignupRegisterPhoneEnabled(): boolean {
  return envFlagTrue("WHATSAPP_EMBEDDED_SIGNUP_REGISTER_PHONE");
}

export type WhatsAppEmbeddedSignupOnboardingMode = "cloud_api_new" | "coexistence";

/** App credentials required for code exchange. Path-specific config IDs are resolved separately. */
export type MetaEmbeddedSignupEnvConfig = {
  appId: string;
  appSecret: string;
  graphApiVersion: string;
};

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
 * Never falls back to the other path's ID. Never uses legacy META_EMBEDDED_SIGNUP_CONFIG_ID.
 * Returns null when the required env is unset — callers must close the feature clearly.
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

export type WhatsAppEmbeddedSignupLaunchExtras = {
  setup: Record<string, never>;
  featureType?: "whatsapp_business_app_onboarding";
};

/**
 * Build FB.login extras for Meta Embedded Signup v4.
 *
 * v4: products/permissions come from the Facebook Login for Business configuration.
 * Do NOT send sessionInfoVersion, version, or legacy feature overrides.
 * Coexistence still requires featureType=whatsapp_business_app_onboarding when that path is enabled.
 */
export function buildWhatsAppEmbeddedSignupV4LaunchExtras(input: {
  onboardingMode: WhatsAppEmbeddedSignupOnboardingMode;
  featureType: "whatsapp_business_app_onboarding" | null;
}): WhatsAppEmbeddedSignupLaunchExtras {
  const extras: WhatsAppEmbeddedSignupLaunchExtras = {
    setup: {},
  };
  if (
    input.onboardingMode === "coexistence" &&
    input.featureType === "whatsapp_business_app_onboarding"
  ) {
    extras.featureType = "whatsapp_business_app_onboarding";
  }
  return extras;
}

/**
 * Resolve the 6-digit Cloud API registration PIN when register-phone is enabled.
 * Never defaults to "000000".
 */
export function readWhatsAppEmbeddedSignupRegistrationPin(): string | null {
  const pin = String(process.env[WHATSAPP_EMBEDDED_SIGNUP_REGISTRATION_PIN_ENV] ?? "").trim();
  if (!/^\d{6}$/.test(pin)) return null;
  return pin;
}
