#!/usr/bin/env node
/**
 * Bootstrap `.env.localstack` from `supabase status` for VALUEOR_ENV=local.
 * Does not modify root `.env` (production/hosting credentials stay intact).
 *
 * Also ensures a LOCAL-ONLY platform crypto secret exists for Postgres
 * `pgp_sym_encrypt` (WhatsApp / channel / platform AI settings). The secret is
 * stored in ignored `.env.localstack` as PLATFORM_AI_CRYPTO_SECRET and synced
 * into `public.platform_ai_settings` key `crypto_secret` (see migration 172).
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertLocalEnvironmentSafety,
  assertNoServerSecretsInViteEnv,
  isProductionWebhookUrl,
} from "./lib/env-mode.mjs";
import { loadProjectEnv, validateApiServerEnv } from "./lib/load-project-env.mjs";
import {
  LOCAL_API_ORIGIN,
  LOCAL_API_PORT,
  readLocalIntegrationEnv,
  resolveLocalPublicWebhookBase,
} from "./lib/local-integration.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localstackPath = resolve(projectRoot, ".env.localstack");

function parseStatusEnv(raw) {
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

function parseEnvFile(filePath) {
  const env = {};
  if (!existsSync(filePath)) return env;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

async function resolveLocalPlatformCryptoSecret(databaseUrl) {
  const existingFile = parseEnvFile(localstackPath);
  const fromFile = (existingFile.PLATFORM_AI_CRYPTO_SECRET || "").trim();
  if (fromFile) {
    return { secret: fromFile, source: "env.localstack" };
  }

  const { default: pg } = await import("../lib/db/node_modules/pg/lib/index.js");
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query(
      `select nullif(trim(value), '') as value
         from public.platform_ai_settings
        where key = 'crypto_secret'
        limit 1`,
    );
    const fromDb = (rows[0]?.value || "").trim();
    if (fromDb) {
      return { secret: fromDb, source: "platform_ai_settings" };
    }
  } finally {
    await client.end();
  }

  return {
    secret: randomBytes(32).toString("hex"),
    source: "generated",
  };
}

async function syncPlatformCryptoSecretToLocalDb(databaseUrl, secret) {
  const { default: pg } = await import("../lib/db/node_modules/pg/lib/index.js");
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(
      `insert into public.platform_ai_settings(key, value, updated_at)
       values ('crypto_secret', $1, now())
       on conflict (key) do update
         set value = excluded.value, updated_at = now()`,
      [secret],
    );
    const { rows } = await client.query(
      `select
         (public.platform_ai_crypto_secret() is not null
          and length(trim(public.platform_ai_crypto_secret())) > 0) as configured`,
    );
    if (!rows[0]?.configured) {
      throw new Error("platform_ai_crypto_secret() still empty after local upsert");
    }
  } finally {
    await client.end();
  }
}

function readSupabaseStatusEnv() {
  try {
    const raw = execFileSync("supabase", ["status", "-o", "env"], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    return parseStatusEnv(raw);
  } catch (error) {
    const stderr = error?.stderr?.toString?.() || error?.message || String(error);
    // PowerShell/CLI may write notices to stderr while still emitting env on stdout.
    if (error?.stdout) {
      return parseStatusEnv(String(error.stdout));
    }
    throw new Error(
      [
        "Failed to read local Supabase credentials via `supabase status -o env`.",
        "Ensure the local stack is running (`supabase start`).",
        stderr,
      ].join("\n"),
    );
  }
}

const status = readSupabaseStatusEnv();
const apiUrl = status.API_URL || "http://127.0.0.1:54321";
const dbUrl = status.DB_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const anonKey = status.ANON_KEY || status.PUBLISHABLE_KEY;
const serviceRoleKey = status.SERVICE_ROLE_KEY || status.SECRET_KEY;
const publishableKey = status.PUBLISHABLE_KEY || status.ANON_KEY;

if (!anonKey || !serviceRoleKey) {
  console.error("LOCAL ENVIRONMENT SAFETY CHECK FAILED");
  console.error("  - supabase status did not return anon/service_role keys");
  process.exit(1);
}

// Local API must use LOCAL_API_PORT (3001) so it never collides with production :3000.
// Do not inherit a shell PORT=3000 from a production API session.
const listenPort = String(LOCAL_API_PORT);
const apiServerUrl = LOCAL_API_ORIGIN;

const cryptoResolved = await resolveLocalPlatformCryptoSecret(dbUrl);
const platformAiCryptoSecret = cryptoResolved.secret;

const lines = [
  "# AUTO-GENERATED by scripts/ensure-localstack-env.mjs — DO NOT COMMIT",
  "# Local Supabase profile (VALUEOR_ENV=local). Root `.env` is left untouched.",
  "VALUEOR_ENV=local",
  "NODE_ENV=development",
  `PORT=${listenPort}`,
  "",
  `SUPABASE_URL=${apiUrl}`,
  `VITE_SUPABASE_URL=${apiUrl}`,
  `SUPABASE_ANON_KEY=${anonKey}`,
  `SUPABASE_PUBLISHABLE_KEY=${publishableKey}`,
  `VITE_SUPABASE_PUBLISHABLE_KEY=${publishableKey}`,
  `SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey}`,
  `SUPABASE_SECRET_KEY=${serviceRoleKey}`,
  "",
  `DATABASE_URL=${dbUrl}`,
  "# Do not set SUPABASE_PROJECT_REF / SUPABASE_DB_PASSWORD in local mode.",
  "",
  `VITE_API_SERVER_URL=${apiServerUrl}`,
  "VITE_APP_ORIGIN=http://localhost:5173",
  "FRONTEND_ORIGIN=http://localhost:5173",
  "LOGIN_APP_URL=http://localhost:5173",
  "",
  "# Local-only: AI catalog search may use product aliases (migration 422). Off in production by default.",
  "VALUEOR_PRODUCT_ALIAS_SEARCH=true",
  "# Local-only: auto-generate product aliases via platform AI after create/update. Off in production by default.",
  "VALUEOR_PRODUCT_ALIAS_GENERATION=true",
  "VITE_VALUEOR_PRODUCT_ALIAS_GENERATION=true",
  "",
  "# Local-only: run sales follow-up worker ticks. ALLOW_SEND stays false — no real customer sends.",
  "SALES_FOLLOW_UP_WORKER_ENABLED=true",
  "SALES_FOLLOW_UP_WORKER_ALLOW_SEND=false",
  "SALES_FOLLOW_UP_WORKER_INTERVAL_MS=60000",
  "",
];

// Preserve per-developer tunnel bases from `.env.local.integration` (never production).
const integration = readLocalIntegrationEnv(projectRoot);
const integrationWebhookBase = resolveLocalPublicWebhookBase(integration);
if (integrationWebhookBase && !isProductionWebhookUrl(integrationWebhookBase)) {
  lines.push("# From .env.local.integration (per-developer LOCAL tunnel — not webhook.valueor.org).");
  lines.push(`PUBLIC_WEBHOOK_BASE_URL=${integrationWebhookBase}`);
  lines.push(`WEBHOOK_BASE_URL=${integrationWebhookBase}`);
  lines.push(`VITE_WEBHOOK_BASE_URL=${integrationWebhookBase}`);
  if (integration.LOCAL_INTEGRATION_ENABLED?.trim()) {
    lines.push(`LOCAL_INTEGRATION_ENABLED=${integration.LOCAL_INTEGRATION_ENABLED.trim()}`);
  }
  if (integration.ALLOW_LOCAL_EXTERNAL_OUTBOUND?.trim()) {
    lines.push(`ALLOW_LOCAL_EXTERNAL_OUTBOUND=${integration.ALLOW_LOCAL_EXTERNAL_OUTBOUND.trim()}`);
  }
  lines.push("");
} else {
  lines.push("# Webhook bases intentionally unset — do not default to webhook.valueor.org.");
  lines.push("# Set a developer tunnel in .env.local.integration (see docs/operations/local-integration-tunnel.md).");
  lines.push("# WEBHOOK_BASE_URL=");
  lines.push("# VITE_WEBHOOK_BASE_URL=");
  lines.push("# PUBLIC_WEBHOOK_BASE_URL=");
  lines.push("");
}

lines.push("# Local Quote Delivery verification — Fake Provider inside QuoteSendService only.");
lines.push("# No SMTP/Meta. Does NOT bypass assertLocalExternalOutboundAllowed.");
lines.push("VALUEOR_QUOTE_SEND_FAKE_PROVIDER=1");
lines.push("VALUEOR_QUOTE_SEND_FAKE_MODE=success");
lines.push("");
lines.push("SESSION_SECRET=dev-secret-change-me");
lines.push("INTERNAL_API_KEY=dev-internal-api-key");
lines.push("");
lines.push("# LOCAL-ONLY crypto secret for platform_ai_settings / WhatsApp pgp_sym_encrypt.");
lines.push("# Never copy production values. Synced into local DB by this script.");
lines.push(`PLATFORM_AI_CRYPTO_SECRET=${platformAiCryptoSecret}`);
lines.push("");

writeFileSync(localstackPath, `${lines.join("\n")}\n`, "utf8");
console.log(`Wrote ${localstackPath}`);

try {
  await syncPlatformCryptoSecretToLocalDb(dbUrl, platformAiCryptoSecret);
  console.log(
    `Local platform crypto secret OK (source=${cryptoResolved.source}, synced → platform_ai_settings.crypto_secret)`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Failed to sync PLATFORM_AI_CRYPTO_SECRET into local platform_ai_settings:");
  console.error(`  ${message}`);
  process.exit(1);
}

process.env.VALUEOR_ENV = "local";
const env = loadProjectEnv(projectRoot, {
  hydrateProcessEnv: false,
  mergeProcessEnv: false,
  assertSafety: true,
});

const validation = validateApiServerEnv(env);
if (!validation.ok) {
  console.error("LOCAL ENVIRONMENT SAFETY CHECK FAILED");
  console.error(`Missing after bootstrap: ${validation.missing.join(", ")}`);
  process.exit(1);
}

assertLocalEnvironmentSafety(env);
assertNoServerSecretsInViteEnv({
  VITE_SUPABASE_URL: env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: env.VITE_SUPABASE_PUBLISHABLE_KEY,
  VITE_API_SERVER_URL: env.VITE_API_SERVER_URL,
  VITE_APP_ORIGIN: env.VITE_APP_ORIGIN,
  VITE_WEBHOOK_BASE_URL: env.VITE_WEBHOOK_BASE_URL,
});

if (!existsSync(localstackPath)) {
  console.error("Failed to create .env.localstack");
  process.exit(1);
}

console.log("Localstack environment OK (VALUEOR_ENV=local)");
console.log(`  SUPABASE_URL → ${env.SUPABASE_URL}`);
console.log(`  DATABASE_URL → local Postgres @ 127.0.0.1:54322`);
console.log(`  VITE_API_SERVER_URL → ${env.VITE_API_SERVER_URL}`);
console.log(`  VITE_APP_ORIGIN → ${env.VITE_APP_ORIGIN}`);
console.log(`  PLATFORM_AI_CRYPTO_SECRET → configured (len=${platformAiCryptoSecret.length}, value not printed)`);
