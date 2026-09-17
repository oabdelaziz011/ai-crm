import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LOCAL_OPTIONAL_MERGE_KEYS,
  VALUEOR_ENV_LOCAL,
  VALUEOR_ENV_PRODUCTION,
  assertLocalEnvironmentSafety,
  isLocalValueorEnv,
  isProductionDatabaseUrl,
  isProductionSupabaseUrl,
  resolveValueorEnv,
} from "./env-mode.mjs";
import {
  applyLocalIntegrationOverlay,
  readLocalIntegrationEnv,
} from "./local-integration.mjs";

/** @deprecated Prefer resolveEnvFilesForMode — kept for callers that import the constant. */
export const PROJECT_ENV_FILES = [".env", "artifacts/platform-worker/.env"];

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

export function extractSupabaseProjectRef(supabaseUrl) {
  if (!supabaseUrl) return null;
  try {
    const hostname = new URL(supabaseUrl).hostname;
    const match = hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function resolveEnvFilesForMode(mode = resolveValueorEnv()) {
  if (mode === VALUEOR_ENV_LOCAL) {
    // Localstack first (wins). Root `.env` may supply optional provider keys only
    // via LOCAL_OPTIONAL_MERGE_KEYS — never login-app/.env.local (Vite-only).
    return [".env.localstack", ".env", "artifacts/platform-worker/.env"];
  }
  // Production / hosted: root + worker. Never login-app/.env.local.
  return [".env", "artifacts/platform-worker/.env"];
}

function mergeEnvFiles(projectRoot, files, options = {}) {
  const env = {};
  const optionalOnlyFrom = options.optionalOnlyFrom ?? null;
  const optionalKeys = new Set(options.optionalKeys ?? []);

  for (const relativePath of files) {
    const filePath = resolve(projectRoot, relativePath);
    const parsed = parseEnvFile(filePath);
    const restrict =
      optionalOnlyFrom &&
      relativePath.replace(/\\/g, "/") === optionalOnlyFrom.replace(/\\/g, "/");

    for (const [key, value] of Object.entries(parsed)) {
      if (!value) continue;
      if (restrict && !optionalKeys.has(key)) continue;
      env[key] ??= value;
    }
  }

  return env;
}

/**
 * Load env files into a map. Existing process.env values always win when hydrating.
 */
export function loadProjectEnv(projectRoot, options = {}) {
  const mode = resolveValueorEnv(
    options.valueorEnv ?? process.env.VALUEOR_ENV ?? options.defaultMode,
  );
  const files = options.files ?? resolveEnvFilesForMode(mode);

  let env;
  if (mode === VALUEOR_ENV_LOCAL && !options.files) {
    // First file (.env.localstack) unrestricted; root `.env` optional-keys only.
    env = {};
    const localstack = parseEnvFile(resolve(projectRoot, ".env.localstack"));
    for (const [key, value] of Object.entries(localstack)) {
      if (!value) continue;
      env[key] ??= value;
    }
    const root = parseEnvFile(resolve(projectRoot, ".env"));
    const optional = new Set(LOCAL_OPTIONAL_MERGE_KEYS);
    for (const [key, value] of Object.entries(root)) {
      if (!value) continue;
      if (!optional.has(key)) continue;
      env[key] ??= value;
    }
    const worker = parseEnvFile(resolve(projectRoot, "artifacts/platform-worker/.env"));
    for (const [key, value] of Object.entries(worker)) {
      if (!value) continue;
      if (!optional.has(key) && !(key in localstack)) {
        // Worker may add worker-specific non-infra keys; still block cloud supabase overrides.
        if (
          key.startsWith("SUPABASE_") ||
          key.startsWith("VITE_SUPABASE_") ||
          key === "DATABASE_URL" ||
          key === "WEBHOOK_BASE_URL" ||
          key === "VITE_WEBHOOK_BASE_URL" ||
          key === "PUBLIC_WEBHOOK_BASE_URL" ||
          key === "SUPABASE_PROJECT_REF" ||
          key === "SUPABASE_DB_PASSWORD"
        ) {
          continue;
        }
      }
      env[key] ??= value;
    }
    // Per-developer LOCAL integration overlay (gitignored). Wins for webhook/tunnel keys only.
    env = applyLocalIntegrationOverlay(env, readLocalIntegrationEnv(projectRoot));
  } else {
    env = mergeEnvFiles(projectRoot, files);
  }

  env.VALUEOR_ENV ??= mode;

  const normalized = normalizeProjectEnv(env, { mode });

  if (options.mergeProcessEnv) {
    const protectedLocalKeys = new Set([
      "VALUEOR_ENV",
      "SUPABASE_URL",
      "VITE_SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "SUPABASE_PUBLISHABLE_KEY",
      "VITE_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_SECRET_KEY",
      "DATABASE_URL",
      "SUPABASE_DB_PASSWORD",
      "SUPABASE_PROJECT_REF",
      "WEBHOOK_BASE_URL",
      "VITE_WEBHOOK_BASE_URL",
      "PUBLIC_WEBHOOK_BASE_URL",
      "VITE_API_SERVER_URL",
      "VITE_APP_ORIGIN",
      "FRONTEND_ORIGIN",
      "LOGIN_APP_URL",
    ]);
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value !== "string" || !value.trim()) continue;
      if (mode === VALUEOR_ENV_LOCAL && protectedLocalKeys.has(key)) {
        // File profile wins for infra targets in local mode (prevents shell prod leakage).
        if (normalized[key]?.trim()) continue;
      }
      normalized[key] = value;
    }
    normalized.VALUEOR_ENV = mode;
    const merged = normalizeProjectEnv(normalized, { mode });
    if (options.assertSafety !== false) {
      assertLocalEnvironmentSafety(merged);
    }
    return merged;
  }

  if (hydrateProcessEnvSafe(options)) {
    for (const [key, value] of Object.entries(normalized)) {
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
    process.env.VALUEOR_ENV ??= mode;
  }

  if (options.assertSafety !== false) {
    assertLocalEnvironmentSafety(normalized);
  }

  return normalized;
}

function hydrateProcessEnvSafe(options) {
  return options.hydrateProcessEnv ?? false;
}

/**
 * Apply cross-app aliases and dev defaults used by api-server and scripts.
 */
export function normalizeProjectEnv(env, options = {}) {
  const out = { ...env };
  const mode = options.mode ?? resolveValueorEnv(out.VALUEOR_ENV);

  out.VALUEOR_ENV = mode;

  out.SUPABASE_URL ??= out.VITE_SUPABASE_URL;
  out.VITE_SUPABASE_URL ??= out.SUPABASE_URL;

  out.SUPABASE_PUBLISHABLE_KEY ??= out.VITE_SUPABASE_PUBLISHABLE_KEY;
  out.VITE_SUPABASE_PUBLISHABLE_KEY ??= out.SUPABASE_PUBLISHABLE_KEY;

  out.SUPABASE_ANON_KEY ??= out.SUPABASE_PUBLISHABLE_KEY;
  out.SUPABASE_SECRET_KEY ??= out.SUPABASE_SERVICE_ROLE_KEY;

  // LOCAL: never derive production pooler DATABASE_URL.
  if (mode === VALUEOR_ENV_LOCAL) {
    if (!out.DATABASE_URL?.trim()) {
      // Prefer explicit local default when localstack omitted it.
      out.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
    }
    if (isProductionDatabaseUrl(out.DATABASE_URL)) {
      throw new Error(
        [
          "LOCAL ENVIRONMENT SAFETY CHECK FAILED",
          "Offending configuration:",
          "  - DATABASE_URL (production Supabase pooler/cloud host)",
          "",
          "LOCAL mode must use local Postgres (127.0.0.1:54322).",
        ].join("\n"),
      );
    }
    // Strip cloud pooler inputs so later code cannot rebuild prod URL.
    if (out.SUPABASE_PROJECT_REF && String(out.SUPABASE_PROJECT_REF).includes("lfbtnsk")) {
      delete out.SUPABASE_PROJECT_REF;
    }
    // Do not keep production DB password around in local mode for derivation.
    if (out.SUPABASE_DB_PASSWORD && isProductionSupabaseUrl(out.SUPABASE_URL || "")) {
      delete out.SUPABASE_DB_PASSWORD;
    }
  } else if (!out.DATABASE_URL?.trim() && out.SUPABASE_DB_PASSWORD?.trim()) {
    const projectRef =
      extractSupabaseProjectRef(out.SUPABASE_URL ?? out.VITE_SUPABASE_URL) ??
      out.SUPABASE_PROJECT_REF;
    const region = out.SUPABASE_REGION ?? "eu-north-1";
    if (projectRef) {
      const password = encodeURIComponent(out.SUPABASE_DB_PASSWORD.trim());
      out.DATABASE_URL = `postgresql://postgres.${projectRef}:${password}@aws-0-${region}.pooler.supabase.com:5432/postgres`;
    }
  }

  if (mode === VALUEOR_ENV_LOCAL) {
    out.VITE_API_SERVER_URL ??= "http://localhost:3000";
    out.VITE_APP_ORIGIN ??= "http://localhost:5173";
    out.FRONTEND_ORIGIN ??= "http://localhost:5173";
    out.LOGIN_APP_URL ??= out.VITE_APP_ORIGIN || "http://localhost:5173";
    out.NODE_ENV ??= "development";
    out.PORT ??= "3000";
    // Webhook bases must NOT default to production.
    if (out.WEBHOOK_BASE_URL && /webhook\.valueor\.org/i.test(out.WEBHOOK_BASE_URL)) {
      delete out.WEBHOOK_BASE_URL;
    }
    if (out.VITE_WEBHOOK_BASE_URL && /webhook\.valueor\.org/i.test(out.VITE_WEBHOOK_BASE_URL)) {
      delete out.VITE_WEBHOOK_BASE_URL;
    }
    if (out.PUBLIC_WEBHOOK_BASE_URL && /webhook\.valueor\.org/i.test(out.PUBLIC_WEBHOOK_BASE_URL)) {
      delete out.PUBLIC_WEBHOOK_BASE_URL;
    }
  }

  if (!out.SESSION_SECRET?.trim()) {
    out.SESSION_SECRET = "dev-secret-change-me";
  }

  const nodeEnv = out.NODE_ENV?.trim() || process.env.NODE_ENV?.trim() || "development";
  if (nodeEnv !== "production" && !out.INTERNAL_API_KEY?.trim()) {
    out.INTERNAL_API_KEY = "dev-internal-api-key";
  }

  out.PORT ??= "3000";
  out.NODE_ENV ??= mode === VALUEOR_ENV_PRODUCTION ? "production" : "development";

  return out;
}

export const API_SERVER_DEV_REQUIRED = [
  "DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

export function validateApiServerEnv(env, options = {}) {
  const nodeEnv = options.nodeEnv ?? env.NODE_ENV ?? process.env.NODE_ENV ?? "development";
  const required =
    nodeEnv === "production"
      ? [...API_SERVER_DEV_REQUIRED, "SESSION_SECRET", "INTERNAL_API_KEY"]
      : [...API_SERVER_DEV_REQUIRED];

  const missing = required.filter((key) => !env[key]?.trim());

  return {
    ok: missing.length === 0,
    missing,
    nodeEnv,
    valueorEnv: resolveValueorEnv(env.VALUEOR_ENV),
  };
}

export function formatMissingEnvHelp(projectRoot, missing) {
  const mode = resolveValueorEnv(process.env.VALUEOR_ENV);
  const lines = [
    "Missing required environment variables for api-server:",
    ...missing.map((key) => `  - ${key}`),
    "",
  ];

  if (mode === VALUEOR_ENV_LOCAL) {
    lines.push(
      "LOCAL mode loads `.env.localstack` (see `node scripts/ensure-localstack-env.mjs`).",
      "Run: node scripts/ensure-localstack-env.mjs",
      "Then: pnpm dev:api:local",
    );
  } else {
    const ref =
      extractSupabaseProjectRef(
        loadProjectEnv(projectRoot, { hydrateProcessEnv: false, assertSafety: false }).SUPABASE_URL,
      ) ?? "YOUR_PROJECT_REF";

    lines.push(
      "Production/hosted mode loads repository root `.env` (see .env.example).",
      "",
    );
    if (missing.includes("DATABASE_URL")) {
      lines.push(
        "Set DATABASE_URL to your Supabase Postgres connection string (Session pooler), e.g.:",
        `  https://supabase.com/dashboard/project/${ref}/settings/database`,
        "",
        "Alternatively set SUPABASE_DB_PASSWORD in `.env` and the loader will build DATABASE_URL.",
      );
    }
    if (missing.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      lines.push(
        "Set SUPABASE_SERVICE_ROLE_KEY from Supabase Dashboard → Project Settings → API → service_role.",
      );
    }
    lines.push("", "Run: node scripts/ensure-root-env.mjs");
  }

  return lines.join("\n");
}

export {
  resolveValueorEnv,
  isLocalValueorEnv,
  assertLocalEnvironmentSafety,
  VALUEOR_ENV_LOCAL,
  VALUEOR_ENV_PRODUCTION,
} from "./env-mode.mjs";
