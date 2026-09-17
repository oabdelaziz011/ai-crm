/**
 * VALUEOR_ENV profile helpers — local vs production isolation.
 * Default for developer tooling is `local`. Hosted deploys set production via process env.
 */

export const VALUEOR_ENV_LOCAL = "local";
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
];

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

function normalizeOrigin(url) {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

/**
 * Fail-fast local-mode safety checks. Never prints secret values.
 */
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
  if (String(env.SUPABASE_PROJECT_REF || "").includes("lfbtnskmvibikalsxwsm")) {
    offenders.push("SUPABASE_PROJECT_REF (production project ref)");
  }

  if (offenders.length > 0) {
    const message = [
      "LOCAL ENVIRONMENT SAFETY CHECK FAILED",
      "VALUEOR_ENV=local cannot use production Supabase, production DATABASE_URL, or production webhook URLs.",
      "Offending configuration:",
      ...offenders.map((item) => `  - ${item}`),
      "",
      "Fix: run `node scripts/ensure-localstack-env.mjs` and use `pnpm dev:local` / `pnpm dev:api:local`.",
      "Do not point local mode at lfbtnskmvibikalsxwsm / webhook.valueor.org.",
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
