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

export type MetaEmbeddedSignupEnvConfig = {
  appId: string;
  appSecret: string;
  configId: string;
  graphApiVersion: string;
};

export function readMetaEmbeddedSignupEnvConfig(): MetaEmbeddedSignupEnvConfig | null {
  const appId = String(process.env.META_EMBEDDED_SIGNUP_APP_ID ?? "").trim();
  const appSecret = String(process.env.META_EMBEDDED_SIGNUP_APP_SECRET ?? "").trim();
  const configId = String(process.env.META_EMBEDDED_SIGNUP_CONFIG_ID ?? "").trim();
  const graphApiVersion =
    String(process.env.META_EMBEDDED_SIGNUP_GRAPH_VERSION ?? "").trim() || "v21.0";

  if (!appId || !appSecret || !configId) {
    return null;
  }

  return { appId, appSecret, configId, graphApiVersion };
}
