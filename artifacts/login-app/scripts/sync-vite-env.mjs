/**
 * Sync client-safe VITE_* vars into login-app/.env.local.
 *
 * VALUEOR_ENV=local (default for developer tooling):
 *   Reads `.env.localstack` only — never copies production root `.env` Supabase/webhook values.
 *
 * VALUEOR_ENV=production:
 *   Reads root `.env` for hosted/cloud SPA builds (explicit opt-in).
 *
 * Never writes service_role, DATABASE_URL, or other server secrets.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertNoServerSecretsInViteEnv,
  isProductionSupabaseUrl,
  isProductionWebhookUrl,
  resolveValueorEnv,
  VALUEOR_ENV_LOCAL,
} from "../../../scripts/lib/env-mode.mjs";
import {
  readLocalIntegrationEnv,
  resolveLocalPublicWebhookBase,
} from "../../../scripts/lib/local-integration.mjs";

const loginAppRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = resolve(loginAppRoot, "../..");
const envLocalPath = resolve(loginAppRoot, ".env.local");

function parseEnvFile(filePath) {
  const env = {};
  if (!existsSync(filePath)) return env;
  try {
    for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) continue;
      env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* optional */
  }
  return env;
}

const mode = resolveValueorEnv(process.env.VALUEOR_ENV);
const localstack = parseEnvFile(resolve(projectRoot, ".env.localstack"));
const rootEnv = parseEnvFile(resolve(projectRoot, ".env"));
const integrationEnv = mode === VALUEOR_ENV_LOCAL ? readLocalIntegrationEnv(projectRoot) : {};
const source = mode === VALUEOR_ENV_LOCAL ? localstack : rootEnv;

if (mode === VALUEOR_ENV_LOCAL && !existsSync(resolve(projectRoot, ".env.localstack"))) {
  console.error(
    "Missing .env.localstack. Run: node scripts/ensure-localstack-env.mjs",
  );
  process.exit(1);
}

const supabaseUrl =
  source.VITE_SUPABASE_URL || source.SUPABASE_URL;
const supabaseKey =
  source.VITE_SUPABASE_PUBLISHABLE_KEY ||
  source.SUPABASE_PUBLISHABLE_KEY ||
  source.SUPABASE_ANON_KEY;
const apiServerUrl =
  source.VITE_API_SERVER_URL ||
  (mode === VALUEOR_ENV_LOCAL ? "http://localhost:3000" : undefined);
const appOrigin =
  source.VITE_APP_ORIGIN ||
  (mode === VALUEOR_ENV_LOCAL ? "http://localhost:5173" : source.FRONTEND_ORIGIN);
const webhookBaseUrl =
  mode === VALUEOR_ENV_LOCAL
    ? resolveLocalPublicWebhookBase({ ...source, ...integrationEnv })
    : source.VITE_WEBHOOK_BASE_URL || source.WEBHOOK_BASE_URL || source.PUBLIC_WEBHOOK_BASE_URL;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    mode === VALUEOR_ENV_LOCAL
      ? "Missing local Supabase config in .env.localstack. Run: node scripts/ensure-localstack-env.mjs"
      : "Missing Supabase config. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in project .env",
  );
  process.exit(1);
}

if (mode === VALUEOR_ENV_LOCAL) {
  if (isProductionSupabaseUrl(supabaseUrl)) {
    console.error("LOCAL ENVIRONMENT SAFETY CHECK FAILED");
    console.error("  - VITE_SUPABASE_URL (production supabase.co host)");
    process.exit(1);
  }
  if (webhookBaseUrl && isProductionWebhookUrl(webhookBaseUrl)) {
    console.error("LOCAL ENVIRONMENT SAFETY CHECK FAILED");
    console.error("  - VITE_WEBHOOK_BASE_URL (https://webhook.valueor.org)");
    process.exit(1);
  }
}

const viteEnv = {
  VITE_SUPABASE_URL: supabaseUrl,
  VITE_SUPABASE_PUBLISHABLE_KEY: supabaseKey,
  VITE_APP_ORIGIN: appOrigin || "http://localhost:5173",
};
if (apiServerUrl) viteEnv.VITE_API_SERVER_URL = apiServerUrl;
// Only write webhook when explicitly set and not production-in-local.
if (webhookBaseUrl && !(mode === VALUEOR_ENV_LOCAL && isProductionWebhookUrl(webhookBaseUrl))) {
  viteEnv.VITE_WEBHOOK_BASE_URL = webhookBaseUrl;
}

assertNoServerSecretsInViteEnv(viteEnv);

const lines = Object.entries(viteEnv).map(([k, v]) => `${k}=${v}`);
writeFileSync(envLocalPath, `${lines.join("\n")}\n`, "utf8");
console.log(`Synced ${envLocalPath} (VALUEOR_ENV=${mode})`);
