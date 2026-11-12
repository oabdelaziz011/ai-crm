/**
 * VALUEOR_ENV profile helpers — local vs production isolation.
 * Default for developer tooling is `local`. Hosted deploys set production via process env.
 */

export const VALUEOR_ENV_LOCAL = "local";
export const VALUEOR_ENV_STAGING = "staging";
export const VALUEOR_ENV_PRODUCTION = "production";

/** Keys that must never be written into Vite / login-app/.env.local */
export const VITE_FORBIDDEN_SERVER_KEYS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "DATABASE_URL",
  "SUPABASE_DB_PASSWORD",
  "INTERNAL_API_KEY",
  "SESSION_SECRET",
  "JWT_SECRET",
  "CLOUDFLARE_TUNNEL_TOKEN",
  "OPENAI_API_KEY",
];

/** Client-safe keys allowed in login-app/.env.local */
export const VITE_ALLOWED_KEYS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_API_SERVER_URL",
  "VITE_APP_ORIGIN",
  "VITE_WEBHOOK_BASE_URL",
  "VITE_STRIPE_PUBLISHABLE_KEY",
  "VITE_FAWRY_API_URL",
  "VITE_WHATSAPP_USE_META",
];

/** Optional server keys that may merge from root `.env` while VALUEOR_ENV=local */
export const LOCAL_OPTIONAL_MERGE_KEYS = [
  "OPENAI_API_KEY",
  "REDIS_URL",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "VITE_STRIPE_PUBLISHABLE_KEY",
  "VITE_FAWRY_API_URL",
  "VITE_WHATSAPP_USE_META",
  "CLOUDFLARE_TUNNEL_NAME",
  "CLOUDFLARE_TUNNEL_HOSTNAME",
  "CLOUDFLARE_TUNNEL_ID",
  "CLOUDFLARE_TUNNEL_TOKEN",
  "WEBHOOK_REQUIRE_SIGNATURE",
  "WEBHOOK_EXECUTE_AI",
  "WHATSAPP_DIRECT_OUTBOUND_BYPASS",
  "AUTOMATION_WORKFLOW_TRACE_DEBUG",
  "AUTOMATION_IF_TRACE_DEBUG",
  "AUTOMATION_LIST_NODE_DEBUG",
  "AUTOMATION_INBOUND_ROUTING_DEBUG",
  "AUTOMATION_WORKFLOW_EXECUTION_DEBUG",
  "WEBHOOK_STACK_DEBUG",
  "EMBEDDING_E2E_LIVE",
  "SESSION_SECRET",
  "INTERNAL_API_KEY",
  // Local sales follow-up worker (also written into .env.localstack by ensure-localstack-env).
  "SALES_FOLLOW_UP_WORKER_ENABLED",
  "SALES_FOLLOW_UP_WORKER_ALLOW_SEND",
  "SALES_FOLLOW_UP_WORKER_INTERVAL_MS",
  "SALES_FOLLOW_UP_WORKER_LIMIT",
  // Local Development Meta Embedded Signup (never Production).
  "META_EMBEDDED_SIGNUP_APP_ID",
  "META_EMBEDDED_SIGNUP_APP_SECRET",
  "META_EMBEDDED_SIGNUP_CLOUD_API_CONFIG_ID",
  "META_EMBEDDED_SIGNUP_COEXISTENCE_CONFIG_ID",
  "META_EMBEDDED_SIGNUP_STATE_SECRET",
  "META_EMBEDDED_SIGNUP_GRAPH_VERSION",
  "WHATSAPP_EMBEDDED_SIGNUP_ENABLED",
  "WHATSAPP_COEXISTENCE_ENABLED",
  "WHATSAPP_EMBEDDED_SIGNUP_AUTO_SUBSCRIBE",
  "WHATSAPP_EMBEDDED_SIGNUP_ALLOW_PRODUCTION_SUBSCRIBE",
  "WHATSAPP_EMBEDDED_SIGNUP_REGISTER_PHONE",
  "VITE_WHATSAPP_EMBEDDED_SIGNUP_ENABLED",
  "VITE_WHATSAPP_COEXISTENCE_ENABLED",
];

const RECORDED_PRODUCTION_PROJECT_REF = "lfbtnskmvibikalsxwsm";
const PROD_SUPABASE_HOST_RE = /\.supabase\.co\b/i;
const PROD_POOLER_HOST_RE = /(?:pooler\.supabase\.com|\.supabase\.com)\b/i;
const PROD_WEBHOOK_URL = "https://webhook.valueor.org";
const LOCAL_SUPABASE_URL_RE = /^https?:\/\/(127\.0\.0\.1|localhost):54321\b/i;
const LOCAL_DB_HOST_RE = /@(127\.0\.0\.1|localhost):54322\b/i;

export function resolveValueorEnv(raw = process.env.VALUEOR_ENV) {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === VALUEOR_ENV_PRODUCTION || value === "prod") {
    return VALUEOR_ENV_PRODUCTION;
  }
  if (value === VALUEOR_ENV_STAGING || value === "stage") {
    return VALUEOR_ENV_STAGING;
  }
  if (value === VALUEOR_ENV_LOCAL || value === "localstack" || value === "development") {
    return VALUEOR_ENV_LOCAL;
  }
  // Explicit empty → local default for developer tooling.
  // Hosted NODE_ENV=production without VALUEOR_ENV → production.
  if (!value) {
    const nodeEnv = String(process.env.NODE_ENV ?? "").trim().toLowerCase();
    if (nodeEnv === "production") return VALUEOR_ENV_PRODUCTION;
    return VALUEOR_ENV_LOCAL;
  }
  return VALUEOR_ENV_LOCAL;
}

export function isLocalValueorEnv(envOrMode) {
  if (typeof envOrMode === "string") {
    return resolveValueorEnv(envOrMode) === VALUEOR_ENV_LOCAL;
  }
  return resolveValueorEnv(envOrMode?.VALUEOR_ENV) === VALUEOR_ENV_LOCAL;
}

export function isProductionSupabaseUrl(url) {
  if (!url?.trim()) return false;
  try {
    return PROD_SUPABASE_HOST_RE.test(new URL(url.trim()).hostname);
  } catch {
    return PROD_SUPABASE_HOST_RE.test(url);
  }
}

export function isProductionDatabaseUrl(url) {
  if (!url?.trim()) return false;
  return PROD_POOLER_HOST_RE.test(url) || PROD_SUPABASE_HOST_RE.test(url);
}

export function recordedProductionSupabaseOrigin() {
  return `https://${RECORDED_PRODUCTION_PROJECT_REF}.supabase.co`;
}

export function isRecordedProductionSupabaseUrl(url) {
  if (!isProductionSupabaseUrl(url)) return false;
  try {
    return new URL(url.trim()).hostname.toLowerCase() === `${RECORDED_PRODUCTION_PROJECT_REF}.supabase.co`;
  } catch {
    return false;
  }
}

export function isRecordedProductionDatabaseUrl(url) {
  return isProductionDatabaseUrl(url) && String(url).includes(RECORDED_PRODUCTION_PROJECT_REF);
}

export function isProductionWebhookUrl(url) {
  if (!url?.trim()) return false;
  return normalizeOrigin(url) === PROD_WEBHOOK_URL;
}

export function isLocalSupabaseUrl(url) {
  if (!url?.trim()) return false;
  return LOCAL_SUPABASE_URL_RE.test(url.trim());
}

export function isLocalDatabaseUrl(url) {
  if (!url?.trim()) return false;
  return LOCAL_DB_HOST_RE.test(url);
}

function isLocalListenerUrl(url) {
  try {
    const parsed = new URL(String(url).trim());
    const host = parsed.hostname.toLowerCase();
    return parsed.protocol === "http:" && (host === "127.0.0.1" || host === "localhost");
  } catch {
    return false;
  }
}

function isSafeStagingDeviceUrl(url) {
  if (!String(url ?? "").startsWith("https://")) return false;
  if (isProductionPublicHost(url) || isProductionWebhookUrl(url)) return false;
  try {
    const host = new URL(String(url).trim()).hostname.toLowerCase();
    return host !== "localhost" && host !== "127.0.0.1" && host !== "::1" && host !== "0.0.0.0";
  } catch {
    return false;
  }
}

function normalizeOrigin(url) {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

/**
 * Fail-fast local-mode safety checks. Never prints secret values.
 */
const PRODUCTION_PUBLIC_HOSTS = new Set(["api.valueor.org", "app.valueor.org", "webhook.valueor.org"]);

export function isProductionPublicHost(url) {
  if (!url?.trim()) return false;
  try {
    return PRODUCTION_PUBLIC_HOSTS.has(new URL(url.trim()).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Staging must be its own hosted project. It must not reuse Production or a loopback database.
 * Error text names the failing key and does not print secret values.
 */
export function assertStagingEnvironmentSafety(env) {
  const mode = resolveValueorEnv(env.VALUEOR_ENV);
  if (mode !== VALUEOR_ENV_STAGING) return;

  const offenders = [];
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const listenUrl = env.VITE_API_SERVER_URL || env.API_URL;
  const deviceUrl = env.EXPO_PUBLIC_API_URL;

  if (!supabaseUrl?.trim() || isLocalSupabaseUrl(supabaseUrl) || !isProductionSupabaseUrl(supabaseUrl)) {
    offenders.push("SUPABASE_URL (staging requires its own hosted Supabase project)");
  } else if (isRecordedProductionSupabaseUrl(supabaseUrl)) {
    offenders.push("SUPABASE_URL (recorded Production project)");
  }
  if (env.DATABASE_URL && (isLocalDatabaseUrl(env.DATABASE_URL) || isRecordedProductionDatabaseUrl(env.DATABASE_URL))) {
    offenders.push("DATABASE_URL (local or recorded Production database)");
  }
  if (listenUrl?.trim() && !isLocalListenerUrl(listenUrl) && !isSafeStagingDeviceUrl(listenUrl)) {
    offenders.push("VITE_API_SERVER_URL (use the local listener or a non-Production HTTPS tunnel)");
  }
  if (deviceUrl?.trim() && !isSafeStagingDeviceUrl(deviceUrl)) {
    offenders.push("EXPO_PUBLIC_API_URL (device URL must be the temporary HTTPS tunnel, not Production or loopback)");
  }
  for (const key of ["WEBHOOK_BASE_URL", "VITE_WEBHOOK_BASE_URL", "PUBLIC_WEBHOOK_BASE_URL"]) {
    if (isProductionWebhookUrl(env[key]) || isProductionPublicHost(env[key])) {
      offenders.push(`${key} (Production webhook)`);
    }
  }
  if (!env.SESSION_SECRET?.trim() || env.SESSION_SECRET === "dev-secret-change-me") {
    offenders.push("SESSION_SECRET (missing or development placeholder)");
  }
  if (!env.INTERNAL_API_KEY?.trim() || env.INTERNAL_API_KEY === "dev-internal-api-key") {
    offenders.push("INTERNAL_API_KEY (missing or development placeholder)");
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY?.trim() && !env.SUPABASE_SECRET_KEY?.trim()) {
    offenders.push("SUPABASE_SERVICE_ROLE_KEY (required on the server, never in the mobile app)");
  }

  if (offenders.length > 0) {
    throw new Error(
      [
        "STAGING ENVIRONMENT SAFETY CHECK FAILED",
        "VALUEOR_ENV=staging cannot use the Production project, the Production API, or the local database.",
        "Offending configuration:",
        ...offenders.map((item) => `  - ${item}`),
        "",
        "Create .env.staging from .env.staging.example after the staging project exists.",
      ].join("\n"),
    );
  }
}

/**
 * Production keeps the recorded Production project. Another hosted project is a staging credential
 * and must not be accepted. This does not change the existing local checks.
 */
export function assertProductionEnvironmentSafety(env) {
  const mode = resolveValueorEnv(env.VALUEOR_ENV);
  if (mode !== VALUEOR_ENV_PRODUCTION) return;

  const offenders = [];
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  if (supabaseUrl?.trim() && !isRecordedProductionSupabaseUrl(supabaseUrl)) {
    offenders.push("SUPABASE_URL (not the recorded Production project)");
  }
  if (isLocalDatabaseUrl(env.DATABASE_URL)) {
    offenders.push("DATABASE_URL (local database)");
  } else if (env.DATABASE_URL?.trim() && /postgres\.[a-z0-9]+\b/i.test(env.DATABASE_URL) && !isRecordedProductionDatabaseUrl(env.DATABASE_URL)) {
    offenders.push("DATABASE_URL (different hosted project)");
  }
  const apiUrl = env.EXPO_PUBLIC_API_URL || env.VITE_API_SERVER_URL;
  if (apiUrl?.trim() && isProductionSupabaseUrl(apiUrl)) {
    offenders.push("API URL (a Supabase host is not the Production API)");
  }

  if (offenders.length > 0) {
    throw new Error(
      [
        "PRODUCTION ENVIRONMENT SAFETY CHECK FAILED",
        "VALUEOR_ENV=production cannot use staging or local database credentials.",
        "Offending configuration:",
        ...offenders.map((item) => `  - ${item}`),
      ].join("\n"),
    );
  }
}

/**
 * ValueOR allows exactly two environments: Development (`local`) and Production.
 * Staging remains in legacy helpers for historical tests only; normal workflows must fail.
 */
export function assertTwoEnvironmentPolicy(env = process.env) {
  const mode = resolveValueorEnv(env.VALUEOR_ENV ?? env);
  if (mode !== VALUEOR_ENV_STAGING) return;
  if (String(env.VALUEOR_ALLOW_STAGING_LEGACY ?? "").trim() === "1") return;
  throw new Error(
    [
      "ENVIRONMENT POLICY FAILED",
      "ValueOR supports exactly two environments: Development (VALUEOR_ENV=local) and Production.",
      "Staging is not a supported environment for engineering or mobile builds.",
      "Use local Supabase + local API for Development. Do not create a third hosted project for day-to-day work.",
    ].join("\n"),
  );
}

export function assertLocalEnvironmentSafety(env) {
  const mode = resolveValueorEnv(env.VALUEOR_ENV);
  if (mode !== VALUEOR_ENV_LOCAL) return;

  const offenders = [];

  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  if (isProductionSupabaseUrl(supabaseUrl)) {
    offenders.push("SUPABASE_URL/VITE_SUPABASE_URL (production supabase.co host)");
  }

  if (env.DATABASE_URL && isProductionDatabaseUrl(env.DATABASE_URL)) {
    offenders.push("DATABASE_URL (production Supabase pooler/cloud host)");
  }

  for (const key of [
    "VITE_API_SERVER_URL",
    "API_URL",
    "EXPO_PUBLIC_API_URL",
    "EXPO_PUBLIC_SUPABASE_URL",
  ]) {
    const value = env[key];
    if (!value?.trim()) continue;
    if (isProductionPublicHost(value) || isProductionWebhookUrl(value)) {
      offenders.push(`${key} (production public host)`);
    }
    if (key.includes("SUPABASE") && isProductionSupabaseUrl(value)) {
      offenders.push(`${key} (production supabase.co host)`);
    }
    if (key.includes("SUPABASE") && isRecordedProductionSupabaseUrl(value)) {
      offenders.push(`${key} (recorded production project)`);
    }
  }

  if (isProductionWebhookUrl(env.WEBHOOK_BASE_URL)) {
    offenders.push("WEBHOOK_BASE_URL (https://webhook.valueor.org)");
  }
  if (isProductionWebhookUrl(env.VITE_WEBHOOK_BASE_URL)) {
    offenders.push("VITE_WEBHOOK_BASE_URL (https://webhook.valueor.org)");
  }
  if (isProductionWebhookUrl(env.PUBLIC_WEBHOOK_BASE_URL)) {
    offenders.push("PUBLIC_WEBHOOK_BASE_URL (https://webhook.valueor.org)");
  }

  if (env.SUPABASE_PROJECT_REF && !/^(local|localhost)$/i.test(env.SUPABASE_PROJECT_REF)) {
    // Local profile should not carry a cloud project ref used for pooler derivation.
    if (env.SUPABASE_DB_PASSWORD?.trim() || isProductionDatabaseUrl(env.DATABASE_URL || "")) {
      offenders.push("SUPABASE_PROJECT_REF (cloud project ref present with DB credentials)");
    }
  }

  // Reject well-known production project ref when paired with any cloud URL remnant.
  if (String(env.SUPABASE_PROJECT_REF || "").includes(RECORDED_PRODUCTION_PROJECT_REF)) {
    offenders.push("SUPABASE_PROJECT_REF (production project ref)");
  }

  if (offenders.length > 0) {
    const message = [
      "LOCAL ENVIRONMENT SAFETY CHECK FAILED",
      "VALUEOR_ENV=local cannot use production Supabase, production API hosts, production DATABASE_URL, or production webhook URLs.",
      "Offending configuration:",
      ...offenders.map((item) => `  - ${item}`),
      "",
      "Fix: run `node scripts/ensure-localstack-env.mjs` and use `pnpm dev:local` / `pnpm dev:api:local`.",
      `Do not point local mode at ${RECORDED_PRODUCTION_PROJECT_REF} / api.valueor.org / webhook.valueor.org.`,
      "Android Emulator must reach the host API via http://10.0.2.2:<dev-api-port> (not 127.0.0.1).",
    ].join("\n");
    throw new Error(message);
  }
}

export function assertNoServerSecretsInViteEnv(envMap) {
  const offenders = [];
  for (const key of VITE_FORBIDDEN_SERVER_KEYS) {
    if (envMap[key]?.trim()) offenders.push(key);
    if (envMap[`VITE_${key}`]?.trim()) offenders.push(`VITE_${key}`);
  }
  // Also reject mis-prefixed service role
  for (const key of Object.keys(envMap)) {
    if (!key.startsWith("VITE_")) continue;
    if (/SERVICE_ROLE|DATABASE_URL|DB_PASSWORD|SESSION_SECRET|INTERNAL_API/i.test(key)) {
      offenders.push(key);
    }
  }
  if (offenders.length > 0) {
    throw new Error(
      [
        "LOCAL ENVIRONMENT SAFETY CHECK FAILED",
        "Server secrets must not appear in Vite/client env:",
        ...[...new Set(offenders)].map((k) => `  - ${k}`),
      ].join("\n"),
    );
  }
}
