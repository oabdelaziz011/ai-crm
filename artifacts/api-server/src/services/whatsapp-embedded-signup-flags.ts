function envFlagTrue(name: string): boolean {
  const raw = String(process.env[name] ?? "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
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
